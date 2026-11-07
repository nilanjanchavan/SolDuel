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

export const LAMPORTS_PER_COIN = 100_000;
export const STAKE_TIERS_COINS = [100, 300, 500] as const;

