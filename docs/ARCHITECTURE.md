# ⚔️ SolDuel: Complete Product & Technical Architecture Documentation

---

## 1. Executive Summary

**SolDuel** is a decentralized, staked 1v1 minigame platform built natively on **Solana Devnet**. It bridges competitive casual gaming with cryptographic trust: two players wager SOL on minigames where every rule, timer, move, and payout is arbitrated **100% on-chain** by an Anchor smart contract.

### Core Value Proposition
- **Zero Backend Servers:** Matchmaking, game state arbitration, timeouts, and prize escrow occur entirely on Solana. Client practice bots run client-side.
- **Provable Fairness & MEV Immunity:** Concurrent and luck-based games utilize SHA-256 commit-reveal protocols and multi-party entropy derivation, making front-running and validator eavesdropping impossible.
- **Real-Time Speed:** Takes advantage of Solana's 400ms block times for responsive competitive play.
- **Cross-Language Engine Parity:** Game rules are verified using shared test vectors executed identically in both Rust (`cargo test`) and TypeScript (`jest`).

---

## 2. Problem Statement & Solution

### The Problem in Web3 Gaming
1. **Centralized Arbitrators:** Most "crypto minigames" run game logic on a centralized Node.js or AWS backend and merely use crypto for deposits and withdrawals, leaving room for server tampering, downtime, and rigged RNG.
2. **Front-Running & MEV Exploitation:** Transparent mempools allow malicious players or validator bots to snoop moves (e.g. seeing Rock and submitting Paper before block inclusion).
3. **Player Inactivity / Disconnect Exploits:** In peer-to-peer wagering, losing players frequently disconnect or stall to freeze the pot indefinitely.
4. **Complex Onboarding:** Forcing users to exchange 44-character Base58 wallet public keys to join a duel ruins the casual gaming flow.

### The SolDuel Solution
1. **Full On-Chain Logic:** Every game rule (board gravity, vocabulary dictionary checks, dice derivation) is implemented deterministically in Rust within the smart contract.
2. **Cryptographic Commit-Reveal:** Players seal their move and salt into a SHA-256 hash before revealing, mathematically preventing front-running.
3. **Automated On-Chain Timeouts:** Timers (30s–60s) with on-chain timestamp verification allow the honest player to claim an instant settlement victory if an opponent stalls.
4. **Readable 6-Digit Room Codes:** Generates human-friendly codes (`SD-XXXXXX`) that map directly to on-chain Program Derived Addresses (PDAs).

---

## 3. High-Level Architecture

```text
+-------------------------------------------------------------------------+
|                       CLIENT LAYER (Next.js 16)                         |
|  - Cyberpunk Cockpit UI          - Offline Practice Bots (Easy/Med/Hard)|
|  - Wallet Adapter (Phantom, etc) - Ephemeral Salt Storage (SessionStore)|
+------------------------------------+------------------------------------+
                                     |
                         RPC Calls / Transactions
                                     |
                                     v
+-------------------------------------------------------------------------+
|                     SOLANA DEVNET PROGRAM (Anchor)                      |
|                                                                         |
|  [WaitingSpot PDA]         [MatchRoom PDA]          [Profile PDA]       |
|  - 120s FIFO Queue         - 1024-byte Buffer       - ELO Rating (1000) |
|  - Quick-Play Matching     - Escrow Balance (2x)    - Bit-Flag Badges   |
|                            - Inactivity Timers      - 1 Room per Wallet |
+------------------------------------+------------------------------------+
                                     |
                     On-Chain Game Engines (Rust)
                                     |
        +-------------------+--------+--------+-------------------+
        |                   |                 |                   |
        v                   v                 v                   v
  Connect Four         Word Chain       Rock Paper Sci.       Dice Duel
 (7x6 Gravity)      (ENABLE1 Merkle)    (Commit-Reveal)    (Joint Entropy)
```

---

## 4. On-Chain State & PDA Model

All persistent state in SolDuel resides in deterministic Program Derived Addresses (PDAs):

### 1. `MatchRoom` PDA
- **Seeds:** `["room", creator_pubkey]`
- **Ownership:** SolDuel Program (`HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u`)
- **Key Fields:**
  - `game`: `u8` (0 = Connect Four, 1 = Word Chain, 2 = RPS, 3 = Dice Duel)
  - `tier`: `u8` (0 = 100 coins, 1 = 300 coins, 2 = 500 coins)
  - `players`: `[Pubkey; 2]` (Player 0 and Player 1)
  - `status`: `Open`, `Active`, `Finished`, or `Cancelled`
  - `first_player`: `u8` (Randomly chosen 0 or 1 upon match activation)
  - `last_action_ts` / `deadline_ts`: `i64` timestamps for inactivity tracking
  - `state`: `[u8; 1024]` (Dedicated memory buffer owned by the specific game engine)

### 2. `Profile` PDA
- **Seeds:** `["profile", wallet_pubkey]`
- **Key Fields:**
  - `wins` / `losses` / `draws`: `u32`
  - `rating`: `u16` (Starts at 1000; adjusted only via skill games)
  - `streak` / `best_streak`: `u16`
  - `badges`: `u32` (Bit-flag mask for unlocked achievements)
  - `active_room`: `Pubkey` (Restricts players to one active match room at a time to prevent double-spending or multi-queueing)

### 3. `WaitingSpot` PDA
- **Seeds:** `["wait", game_id, tier_id]`
- **Key Fields:**
  - `room`: `Pubkey` (The pending Open room)
  - `created_ts`: `i64` (Registration timestamp; expires after 120s)

---

## 5. Economic & Escrow Model

### Currency Abstraction
SolDuel displays balances in **Coins** to keep numbers human-friendly:
$$\text{1 Coin} = 100,000\text{ lamports} = 0.0001\text{ SOL}$$

### Stake Tiers
| Tier Name | Stake per Player (Coins) | Stake in SOL | Total Winner Pot (2x) | Game Scope |
| :--- | :---: | :---: | :---: | :--- |
| **Casual** | 100 Coins | 0.01 SOL | 200 Coins (0.02 SOL) | All games |
| **Contender** | 300 Coins | 0.03 SOL | 600 Coins (0.06 SOL) | All games |
| **High Roller** | 500 Coins | 0.05 SOL | 1,000 Coins (0.10 SOL) | High stakes (Unlocks High Roller Badge) |

### Escrow Guarantees
1. **Zero Value Creation:** Payouts come strictly from the two deposited stakes.
2. **Instant Refund on Draws / Cancellations:** If a match ends in a draw or an Open room is cancelled, the contract returns 100% of lamports to both players.
3. **Fee & Rent Preservation:** The frontend automatically checks wallet balances and prevents users from staking their entire balance, reserving lamports for transaction fees and account rent.

---

## 6. Deep Dive into the 4 Minigames

---

### Game 1: Connect Four (Skill)
- **Classification:** Deterministic Turn-Based Board Game (Skill-Based, affects ELO).
- **Rules:** 7 columns × 6 rows. Players alternate dropping tokens into columns. Gravity drops the token to the lowest unoccupied cell. First to align 4 consecutive tokens horizontally, vertically, or diagonally wins. If all 42 slots fill without a winner, the match concludes in a draw.
- **State Buffer Layout:**
  - Bytes `0..42`: Board cells (`0` = empty, `1` = Player 0, `2` = Player 1).
  - Bytes `42..49`: Column heights (`[u8; 7]`).
  - Byte `49`: Active turn (`0` or `1`).
  - Byte `50`: Move count (`0..42`).
- **Turn Timer:** 60 seconds per move.

---

### Game 2: Word Chain (Skill)
- **Classification:** Vocabulary Speed Duel (Skill-Based, affects ELO).
- **Rules:**
  1. Player 0 picks an opening letter and plays a word starting with it.
  2. Each subsequent word must start with the previous word's **last two letters** if at least 10 words in the dictionary begin with that pair; otherwise, it must start with the **last letter**.
  3. Minimum word length is 3 letters. Words cannot be repeated.
  4. Playing an invalid word, repeating a word, or violating prefix rules incurs a **strike**.
  5. Accumulating **4 strikes** results in an immediate loss.
- **On-Chain Merkle Tree Verification:**
  - Standard dictionary checking is typically impossible on-chain due to storage costs. SolDuel hashes the entire **ENABLE1 English Dictionary (172,727 words)** into a depth-18 Merkle Tree.
  - When submitting a word, the transaction supplies the word string and its 18 sibling hashes. The Anchor program hashes the leaf and verifies it against the hardcoded Merkle Root in `word_chain.rs`.
  - Valid 2-letter prefixes (676 possible pairs from AA to ZZ) are compressed into an on-chain 676-bit bitmap (85 bytes).
- **Turn Timer:** 30 seconds per turn. Timer continues running during strike penalties.

---

### Game 3: Rock Paper Scissors (Luck)
- **Classification:** Best-of-3 Cryptographic Duel (Casual, no ELO impact).
- **Rules:** Standard RPS rules (Rock beats Scissors, Scissors beats Paper, Paper beats Rock). First player to score 2 round victories wins the duel. Max 5 tie rounds allowed.
- **Cryptographic Commit-Reveal Protocol:**
  1. **Phase 1 (Commit):** Each player generates 32 bytes of secure client entropy (`salt`) and submits:
     $$\text{Commit Hash} = \text{SHA256}(\text{room\_pubkey} \parallel \text{player\_idx} \parallel \text{choice} \parallel \text{salt})$$
  2. **Phase 2 (Reveal):** Once both hashes are stored on-chain, both players submit their plaintext `choice` and `salt`. The contract computes the hash and verifies parity with the stored commitment.
  3. **Front-Running Protection:** If a player tries to inspect their opponent's transaction in the mempool or alter their move, the hash mismatch fails and forfeits the match.
- **Showdown Arena:** Revealed choices are saved across rounds, rendering an arena showdown card:
  ```text
  Round X Result: YOU CHOSE 🪨 Rock vs OPPONENT CHOSE ✂️ Scissors
  🎉 YOU WON ROUND X!
  ```
- **Turn Timer:** 60 seconds per phase.

---

### Game 4: Dice Duel (Luck)
- **Classification:** Provably Fair High Roller Duel (Casual, no ELO impact).
- **Rules:** High roll wins. Each round derives two independent dice values ($1 \dots 6$). If both roll identical values, the round is replayed (up to 5 draws).
- **Collaborative Multi-Party Entropy Derivation:**
  Neither player's device chooses their own die roll. Both players submit a secret 32-byte salt and choice through commit-reveal. Once revealed, the rolls are derived deterministically on-chain:
  $$\text{Roll}_0 = \Big(\text{SHA256}(\text{room} \parallel \text{salt}_0 \parallel \text{salt}_1 \parallel \text{choice}_0 \parallel \text{choice}_1 \parallel 0) \pmod 6\Big) + 1$$
  $$\text{Roll}_1 = \Big(\text{SHA256}(\text{room} \parallel \text{salt}_0 \parallel \text{salt}_1 \parallel \text{choice}_0 \parallel \text{choice}_1 \parallel 1) \pmod 6\Big) + 1$$
  Because both players contribute entropy, neither player nor the validator can manipulate the roll outcome.
- **Turn Timer:** 60 seconds per phase.

---

## 7. Matchmaking & Room Lifecycles

### 1. Instant Quick Play (Decentralized FIFO Queue)
1. Player calls `quick_play(game, tier)`.
2. Program checks the `WaitingSpot` PDA (`["wait", game, tier]`):
   - **Spot Empty or Expired (>120s):** Creates an `Open` room, registers it in `WaitingSpot`, and deposits player's stake. (If expired, refunds the previous creator).
   - **Spot Occupied:** Automatically joins the room, transitions status to `Active`, clears the `WaitingSpot`, and randomly assigns `first_player`.

### 2. Private Rooms with 6-Digit Codes
1. Creator clicks **Create Private Room**, generating a room PDA.
2. The UI extracts the first 6 hexadecimal characters of the room's public key (e.g. `SD-B8E218`).
3. The opponent enters this 6-character code into the Join input. The client resolves the code back to the on-chain PDA account and joins in one click.

### 3. Anti-Stall Inactivity Arbitrator
- Every move updates `last_action_ts` and `deadline_ts = last_action_ts + deadline_secs(state)`.
- If an opponent disconnects or intentionally stalls:
  $$\text{Current Time} \ge \text{deadline\_ts} + 5\text{s (grace period)}$$
- The active player calls `claim_timeout()`.
- The program validates the timeout via `Game::laggard(state)`, designates the stalling player as the loser, transfers the full escrow pot to the active player, updates profiles, and closes the room account.

---

## 8. Rating Algorithm & Achievement Badges

### ELO Rating Engine
Skill games (Connect Four and Word Chain) update player ratings on-chain using integer-only math:
- Starting rating: **1000**
- Point delta calculated based on rating differential between players ($K=32$).
- Casual luck games (RPS, Dice) never alter ELO ratings.

### On-Chain Achievement Badges
Badges are stored as persistent bit-flags on the player's `Profile` PDA:

| Badge Flag | Name | Requirement |
| :---: | :--- | :--- |
| `0x01` | **First Win** | Win your first duel on Solana. |
| `0x02` | **3-Win Streak** | Achieve 3 consecutive victories without a loss. |
| `0x04` | **Word Master** | Win a Word Chain duel with **0 strikes** (`flawless_win`). |
| `0x08` | **High Roller** | Win a match at the 500-coin tier. |

---

## 9. Verification & Testing Parity

To ensure that the browser game simulation matches on-chain execution with zero discrepancy, SolDuel uses **Shared JSON Test Vectors** (`tests/vectors/`):

- **TypeScript Engine:** `npm test` runs all 41 test cases across 8 test suites.
- **Rust Contract:** `cargo test` runs unit tests and executes the exact same vectors against the on-chain Rust modules.
- **State Hex Comparison:** Both test runners assert that the final 1024-byte state hex buffer matches to the exact byte.

---

## 10. Deployment Reference

| Resource | Value |
| :--- | :--- |
| **Cluster** | Solana Devnet |
| **RPC Endpoint** | `https://api.devnet.solana.com` |
| **Program ID** | `HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u` |
| **ProgramData PDA** | `57u9V496Pfq974n7kLKMuMvunY139erwwJfUxYuMCB7z` |
| **Deployer Keypair** | `8n3RjBkGaoWnqR3Kzjxhv3TGZgB5B5E6uWXRSzBParAV` |
| **Web Application** | [https://sol-duel-eight.vercel.app/](https://sol-duel-eight.vercel.app/) |
| **GitHub Repository** | [https://github.com/nilanjanchavan/SolDuel](https://github.com/nilanjanchavan/SolDuel) |
| **Solana Explorer** | [View Program on Explorer](https://explorer.solana.com/address/HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u?cluster=devnet) |
