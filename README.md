# SolDuel

Staked 1v1 minigames on Solana **devnet**, built for the MLH Solana Hackathon. An on-chain program escrows stakes, decides winners, and distributes payouts.

## Stack & Prerequisites

- **Anchor CLI**: 1.0.0 (pinned via `Anchor.toml` `[toolchain]`)
- **Solana / Agave CLI**: 3.1.x
- **Rust**: 1.89+
- **Node.js**: LTS (v22+)
- **Package Manager**: npm only

## Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/nilanjanchavan/SolDuel.git
cd SolDuel
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

Default settings connect to Solana `devnet`:
- `NEXT_PUBLIC_CLUSTER=devnet`
- `NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com`
- `NEXT_PUBLIC_PROGRAM_ID=HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u`

### 3. Build Anchor Program

```bash
cd anchor
anchor build
cd ..
```

### 4. Run Tests

Run both Rust and TypeScript test runners:

```bash
# TypeScript tests (includes vector test runner)
npm test

# Rust tests (includes vector test runner)
cd anchor && cargo test
```

### 5. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the app.

## Repository Layout

```
anchor/programs/solduel/src/
  lib.rs state.rs errors.rs constants.rs room.rs profile.rs badges.rs
  games/mod.rs connect_four.rs word_chain.rs rps.rs dice.rs commit_reveal.rs
src/games/                  # TS engines, bots, UI per game
  types.ts index.ts         # interface + registry (frozen, pre-registers all games)
  connect-four/ word-chain/ rps/ dice/
src/app/                    # Next.js App Router routes
scripts/dictionary/         # offline dictionary + Merkle build
tests/vectors/              # shared test vectors (JSON)
```

## Money & Escrow Rules

- UI balances are displayed in **coins**; the Solana program uses lamports.
- **1 coin = 100,000 lamports.**
- Stake tiers: 100 / 300 / 500 coins (tier indices 0 / 1 / 2).
- Stakes sit in the room account PDA (`["room", creator]`).
- Draw or cancel = refund both players.
- Timeout = forfeits match to active player.

See [AGENTS.md](./AGENTS.md) for full project rules, contract specifications, and guidelines.
