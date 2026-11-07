export interface DiceState {
  round: number
  phase: 'commit' | 'reveal'
  rolls: [number, number]
  drawCount: number
  commits: [boolean, boolean]
  reveals: [boolean, boolean]
  commitHashes?: [Uint8Array | null, Uint8Array | null]
  room: Uint8Array | null
}

export type DiceMove =
  { type: 'commit'; room: Uint8Array; hash: Uint8Array } | { type: 'reveal'; choice: number; salt: Uint8Array }
