import { PublicKey } from '@solana/web3.js';

/**
 * Cluster, RPC URL and Program ID configuration.
 * All client components must import from this single source of truth.
 */
export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER || 'devnet') as 'devnet';

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';

export const PROGRAM_ID_STRING =
  process.env.NEXT_PUBLIC_PROGRAM_ID || 'HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u';

export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STRING);

// Money & stake constants
export const LAMPORTS_PER_COIN = 100_000;
export const STAKE_TIERS_COINS = [100, 300, 500] as const;
export const STAKE_TIERS = [100, 300, 500] as const;

// Timers (seconds)
export const CONNECT_FOUR_TIMEOUT_SECS = 60;
export const WORD_CHAIN_TIMEOUT_SECS = 30;
export const COMMIT_REVEAL_TIMEOUT_SECS = 60;
export const TIMEOUT_GRACE_SECS = 5;
export const QUICK_PLAY_EXPIRY_SECS = 120;
export const PRIVATE_ROOM_EXPIRY_SECS = 1800;

// Program Seeds
export const ROOM_SEED = 'room';
export const PROFILE_SEED = 'profile';
export const WAITING_SPOT_SEED = 'wait';

// State buffer
export const GAME_STATE_BUFFER_SIZE = 1024;
export const INITIAL_RATING = 1000;
