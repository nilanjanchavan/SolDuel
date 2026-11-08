# ⚔️ SolDuel

> **Staked 1v1 on-chain minigames on Solana Devnet.**  
> Escrow stakes, verify moves cryptographically, arbitrate outcomes, and distribute payouts — 100% on-chain with zero backend servers.

[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet-14F195?style=for-the-badge&logo=solana&logoColor=black)](https://explorer.solana.com/address/HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u?cluster=devnet)
[![Anchor 1.0.0](https://img.shields.io/badge/Anchor-1.0.0-blueviolet?style=for-the-badge)](https://github.com/coral-xyz/anchor)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-success?style=for-the-badge&logo=vercel)](https://sol-duel-eight.vercel.app/)

---

## 🌐 Live Deployments

- **Web Application:** [https://sol-duel-eight.vercel.app/](https://sol-duel-eight.vercel.app/)
- **Solana Program ID (Devnet):** [`HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u`](https://explorer.solana.com/address/HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u?cluster=devnet)
- **ProgramData Account:** [`57u9V496Pfq974n7kLKMuMvunY139erwwJfUxYuMCB7z`](https://explorer.solana.com/address/57u9V496Pfq974n7kLKMuMvunY139erwwJfUxYuMCB7z?cluster=devnet)
- **Deployment Transaction:** [`2fbFcErVwZfTioaT2tKFaJxzkAfkD2BKP8sKGDfcYTj9kDK5fKD9udwaSthQrfRbaABX9j4MThFroLq3AGAoo4Mb`](https://explorer.solana.com/tx/2fbFcErVwZfTioaT2tKFaJxzkAfkD2BKP8sKGDfcYTj9kDK5fKD9udwaSthQrfRbaABX9j4MThFroLq3AGAoo4Mb?cluster=devnet)

---

## 🕹️ The Minigames

SolDuel features 4 distinct minigames spanning tactical skill and provably fair luck:

| Game | Category | Rating Impact | Mechanics |
| :--- | :---: | :---: | :--- |
| **Connect Four** | Skill | ✅ ELO | 7x6 tactical gravity grid. First to align 4 horizontal, vertical, or diagonal tokens wins. Full board concludes in a refund draw. |
| **Word Chain** | Skill | ✅ ELO | Prefix vocabulary speed duel. Words are verified on-chain against a Merkle root of **172,727 ENABLE1 dictionary words**. 4 strikes loses. |
| **Rock Paper Scissors** | Luck | ❌ Casual | Best-of-3 cryptographically committed showdown. SHA-256 commit-reveal prevents front-running and MEV snooping. |
| **Dice Duel** | Luck | ❌ Casual | Collaborative entropy derivation (`SHA256(room \|\| salt0 \|\| salt1 \|\| choice0 \|\| choice1 \|\| player) % 6 + 1`). Provably tamper-proof rolls. |

---

## ✨ Key Features

### 1. 🛡️ Trustless On-Chain Escrow
- **No Backend Server:** All matchmaking, moves, timeouts, and prize settlements execute purely through the Anchor program on Solana.
- **Fair Escrow PDA:** Stakes sit in a dedicated MatchRoom PDA (`["room", creator]`). Payouts derive strictly from the two deposited stakes.
- **Strict Inactivity Timeouts:** If an opponent stalls past the countdown (30s–60s) + grace period (5s), the active player can claim an instant victory settlement.

### 2. ⚡ Autonomous Matchmaking & 6-Digit Room Codes
- **Instant Quick Play:** Uses on-chain `WaitingSpot` PDAs (`["wait", game, tier]`). Either match with a waiting challenger instantly or deposit a 120s waiting spot for incoming players.
- **Clean 6-Digit Join Codes:** Private duels generate readable 6-character hex codes (e.g. `SD-7A9B2C`) that map to room PDAs, eliminating the need to paste 44-character Base58 strings.

### 3. 🔐 Front-Running Proof Commit-Reveal
In concurrent and luck games, players commit `SHA256(room || player || choice || salt)` before revealing. Neither player nor validator can inspect the opponent's move before sealing their own.

### 4. 🏆 On-Chain Profiles & Skill Rating
- **Skill-Based ELO:** Whole-number Elo rating updates for Connect Four and Word Chain winners.
- **Collectible Badges:** Bit-flag badges recorded in player profiles:
  - 🏅 **First Win** — First duel victory on Solana.
  - 🔥 **3-Win Streak** — Three consecutive victories.
  - 📚 **Word Master** — Flawless Word Chain victory with 0 strikes.
  - 👑 **High Roller** — Victory at the 500-coin tier.

### 5. 🤖 Browser Practice Bots
Practice mode runs offline directly in the client against Easy, Medium, and Hard autonomous bot engines with zero network latency or SOL costs.

---

## 💰 Economy & Stake Rules

UI amounts are rendered in **Coins** for clarity; the program accounts strictly in lamports:

- **1 Coin = 100,000 lamports (0.0001 SOL)**
- **Casual Tier:** 100 Coins (0.01 SOL)
- **Contender Tier:** 300 Coins (0.03 SOL)
- **High Roller Tier:** 500 Coins (0.05 SOL)
- **Refund Guarantee:** Tied matches and cancelled open rooms refund both players 100% of their deposited stakes.

---

## 🏗️ Repository Architecture

```
SolDuel/
├── anchor/
│   ├── programs/solduel/src/
│   │   ├── lib.rs              # Program entrypoint, instruction dispatch & events
│   │   ├── state.rs            # MatchRoom, Profile & WaitingSpot PDA accounts
│   │   ├── errors.rs           # Program error definitions
│   │   ├── constants.rs        # Timeouts, stake tiers & coin conversions
│   │   ├── room.rs             # Escrow management, room lifecycle & timeout claims
│   │   ├── profile.rs          # Player ratings & badges
│   │   └── games/              # On-chain deterministic game engines
│   │       ├── connect_four.rs # 7x6 board evaluation
│   │       ├── word_chain.rs   # 172k ENABLE1 Merkle verification
│   │       ├── rps.rs          # Best-of-3 commit-reveal
│   │       ├── dice.rs         # Provably fair entropy derivation
│   │       └── commit_reveal.rs# Common cryptographic commitment logic
│   └── tests/                  # Rust integration tests
├── src/
│   ├── games/                  # TypeScript engines, bots & UI boards
│   │   ├── connect-four/
│   │   ├── word-chain/
│   │   ├── rps/
│   │   └── dice/
│   ├── components/solduel/     # Cyber-terminal lobby, rules inspector & modals
│   ├── app/                    # Next.js App Router (/play, /room, /profile)
│   └── config.ts               # Single source of truth for Program ID & Devnet RPC
├── scripts/dictionary/         # Offline dictionary preprocessing & Merkle builder
└── tests/vectors/              # Cross-language test vectors (Rust & TS verified)
```

---

## 🚀 Local Development Setup

### Prerequisites
- **Node.js**: v22+ (LTS)
- **npm** only
- **Rust**: 1.89+
- **Solana CLI**: 3.1.x
- **Anchor CLI**: 1.0.0

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/nilanjanchavan/SolDuel.git
cd SolDuel
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env.local
```

Default configuration connects to Solana Devnet:
```env
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u
```

### 3. Run Test Suites
Both the TypeScript and Rust suites run shared test vectors (`tests/vectors/*.json`) to ensure deterministic parity:

```bash
# Run TypeScript Jest test suites (41 tests)
npm test

# Run Rust unit & vector tests
cd anchor && cargo test
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Shared Test Vectors

To guarantee that the TypeScript browser engines and the on-chain Rust contract never diverge, every game is verified against frozen JSON test vectors under `tests/vectors/`:
- `connect-four.json`
- `word-chain.json`
- `rps.json`
- `dice.json`

Both `npm test` and `cargo test` execute every vector and verify the exact final binary state and outcome.

---

## 📜 License

MIT License. Built for the MLH Solana Hackathon.
