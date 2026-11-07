# Solduel: shared rules for humans and AI agents

Staked 1v1 minigames on Solana **devnet**. A program escrows both stakes, decides the winner and pays out. Read this whole file before changing anything. If something here blocks you, stop and ask a human; do not work around it.

## 1. Stack (pinned)
- Anchor 1.0.0 (pin in `Anchor.toml` under `[toolchain]`), Solana CLI 3.1.x, Rust 1.89+, Node LTS, **npm only**.
- Frontend: Next.js + Tailwind. Client: `@solana/web3.js` v1 + `@anchor-lang/core` + `@solana/wallet-adapter-*`.
- NEVER use `@coral-xyz/anchor` (old package) or `@solana/kit` (not compatible with the Anchor client).
- No backend server. Practice bots run in the browser.
- Devnet only. Cluster, RPC URL and program ID come from ONE place: `src/config.ts` (program ID also in `Anchor.toml`).
- Never commit keypairs, wallet JSON or `.env` files.

## 2. Repo layout (adjust to what the scaffold produced, then update this file)
```
anchor/programs/solduel/src/
  lib.rs state.rs errors.rs constants.rs room.rs profile.rs badges.rs
  games/mod.rs connect_four.rs word_chain.rs rps.rs dice.rs commit_reveal.rs
src/games/                  # TS engines, bots, UI per game
  types.ts index.ts         # interface + registry (frozen, pre-registers all games)
  connect-four/ word-chain/ rps/ dice/
src/app/                    # routes: /  /room/[address]  /play/[game] (practice)  /profile/[wallet]
scripts/dictionary/         # offline dictionary + Merkle build
tests/vectors/              # shared test vectors (JSON), used by Rust AND TS tests
```

## 3. Money rules
- UI shows **coins**; the program uses lamports. **1 coin = 100_000 lamports.** Stake tiers: 100 / 300 / 500 coins (tier index 0 / 1 / 2).
- Stakes sit in the room account (PDA). Payouts come only from the two stakes. The program never creates value.
- Draw or cancel = refund both. Timeout = the player holding things up loses.
- The UI must leave a little SOL for fees and rent (never let a player stake their whole balance).

## 4. Accounts (FROZEN once the base is merged)
- `MatchRoom` (PDA seeds `["room", creator]`): `game: u8`, `tier: u8`, `creator`, `players: [Pubkey; 2]`, `status` (Open, Active, Finished, Cancelled), `allowed_opponent: Option<Pubkey>`, `is_quick_play: bool`, `first_player: u8`, `created_ts`, `last_action_ts`, `deadline_ts`, `state: [u8; 1024]` (game-owned buffer), `bump`. If the compiler complains about stack size, Box the account or use zero-copy.
- `Profile` (PDA `["profile", wallet]`): `wins`, `losses`, `draws`, `rating: u16` (start 1000), `streak`, `best_streak`, `badges: u32` (bit flags), `active_room: Pubkey` (default = none; enforces one active room per wallet). Created with `init_if_needed` in create/join/quick_play.
- `WaitingSpot` (PDA `["wait", game, tier]`): `room: Pubkey`, `created_ts`. Quick Play: spot empty -> create an Open room and write it here; spot taken -> join that room and clear the spot. A spot older than `QUICK_PLAY_EXPIRY_SECS` is cleared by the next caller, who refunds the old creator.

## 5. Instructions (signatures FROZEN, so the IDL does not change when games are added)
`create_room(game: u8, tier: u8, allowed_opponent: Option<Pubkey>)`, `join_room()`, `quick_play(game: u8, tier: u8)`, `cancel_room()`, `game_action(data: Vec<u8>)`, `claim_timeout()`, `mint_badge(badge: u8)`.
There is no public `settle`: the base finishes a room internally when a game returns a result or a timeout is claimed (payout, profile and rating updates, close accounts, clear `active_room`).

## 6. Game contract (Rust), implemented per game in `games/<name>.rs`
```rust
pub enum Outcome { Continue, Win(u8 /* player index 0|1 */), Draw }
pub trait Game {
    fn is_skill() -> bool;                       // only skill games change rating
    fn init(state: &mut [u8], first_player: u8, now: i64) -> Result<()>;
    fn apply(state: &mut [u8], player: u8, data: &[u8], now: i64) -> Result<Outcome>;
    fn deadline_secs(state: &[u8]) -> i64;       // time allowed for the next action
    fn laggard(state: &[u8]) -> Option<u8>;      // who is holding things up (None = both)
    fn flawless_win(_state: &[u8], _winner: u8) -> bool { false } // e.g. word chain: won with 0 strikes (Word Master badge)
}
```
- The base checks the signer is a player in an Active room, calls the game, and handles the outcome. The game decides whose turn it is and whether bad input returns an error or counts as a strike (word chain).
- `apply` must be deterministic, must never panic on malformed input, and must stay inside the 1024-byte buffer.
- `games/mod.rs` registers all four games from day one. Nobody edits it afterwards.

## 7. Game contract (TypeScript), implemented per game in `src/games/<name>/`
```ts
export interface GameEngine<S, M> {
  kind: GameKind; isSkill: boolean;
  init(firstPlayer: 0 | 1): S;
  apply(s: S, p: 0 | 1, m: M): { state: S; outcome: 'continue' | 'draw' | { win: 0 | 1 } };
  encodeAction(m: M): Uint8Array;       // must match the Rust `data` format
  decodeState(buf: Uint8Array): S;      // must match the Rust state layout
  bot(level: 'easy' | 'medium' | 'hard'): (s: S, p: 0 | 1) => M;
}
export interface GameUI<S, M> {
  Board(props: { state: S; me: 0 | 1; onMove(m: M): void; disabled: boolean }): JSX.Element;
}
```
The registry in `src/games/index.ts` maps `GameKind` to `{ engine, ui }`. Practice mode and the live match page both use only the registry.

## 8. Shared test vectors
`tests/vectors/<game>.json`: a list of `{ players, actions: [hex...], expected_outcome, final_state_hex }`. Both the Rust tests and the TS engine tests must pass every vector. If they disagree, one implementation is wrong; fix it, do not edit the vector without telling the other person.

## 9. Game rules
- **Connect Four:** 7x6, gravity, four in a row wins, full board is a draw. Skill game.
- **Word chain (skill):** first player picks a letter and plays a word starting with it. Each next word must start with the previous word's last two letters if at least 10 dictionary words start with that pair, otherwise its last letter. Minimum 3 letters, no repeats, per-turn timer. Rule-breaking, repeated or invalid words are strikes; 4 strikes loses (strikes are per player for the whole match, and the timer keeps running after a strike). Words are checked against a dictionary Merkle root in the program; the two-letter flags (676 bits) are generated by the same script.
- **Luck games:** commit-reveal between the two players (hash binds player + room); a missing reveal after the deadline forfeits. Defaults: rock-paper-scissors best of 3, and a dice duel. Ties are draws (refund).
- **First player:** random per match.
- **Timers (constants.rs):** Connect Four 60s, word chain 30s, commit/reveal 60s, 5s grace on timeout claims, Quick Play waiting spot expires after 120s, private rooms after 30 min.
- **Rating:** whole-number math only, skill games only. **Badges** (non-transferable, stored as profile flags first, NFT mint later): First Win, 3-Win Streak, Word Master (win word chain with 0 strikes), High Roller (win at the 500-coin tier).

## 10. Working rules
- Branch names: `feat/<thing>`. One concern per PR. Rebase on `main` before opening a PR. No force-push to `main`.
- Only edit files you own (section 11). Frozen items (sections 4 to 7) change only by agreement between both people; the integrator makes the change on `main` and everyone rebases.
- Do not add dependencies without telling the other person. The base already includes the ones we expect (hashing, Merkle, NFT standard).
- Only the integrator commits the regenerated IDL, on `main`.
- A game is done when: Rust module compiles with unit tests, all shared vectors pass in Rust and TS, the engine, three bot levels and the UI component exist, and it is registered in the registry.
- Keep escrow code simple and boring. Every account is validated; arithmetic is checked; no double join or double finish; timeouts cannot be claimed early.

## 11. Ownership
- **Person A:** program core (`lib.rs`, `state.rs`, `errors.rs`, `constants.rs`, `room.rs`, `profile.rs`, `badges.rs`), `games/mod.rs` (frozen), Connect Four (Rust + TS), app shell, create/link/Quick Play flows, `/room`, `/profile`, deploy.
- **Person B:** `word_chain.rs`, `rps.rs`, `dice.rs`, `commit_reveal.rs` and their TS folders, `scripts/dictionary/`, `/play/[game]` (practice mode).
