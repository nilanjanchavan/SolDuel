// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@anchor-lang/core'
import { Cluster, PublicKey } from '@solana/web3.js'
import SolduelIDL from './idl/solduel.json'
import type { Solduel } from './types/solduel'

// Re-export the generated IDL and type
export { Solduel, SolduelIDL }

// The programId is imported from the program IDL.
export const SOLDUEL_PROGRAM_ID = new PublicKey(SolduelIDL.address)

// Helper function to get the Solduel Anchor program.
export function getSolduelProgram(provider: AnchorProvider, address?: PublicKey): Program<Solduel> {
  return new Program({ ...SolduelIDL, address: address ? address.toBase58() : SolduelIDL.address } as Solduel, provider)
}

// Helper function to get the program ID for the Solduel program depending on the cluster.
export function getSolduelProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      return new PublicKey('HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u')
    case 'mainnet-beta':
    default:
      return SOLDUEL_PROGRAM_ID
  }
}
