export type RpsChoice = 0 | 1 | 2 // 0 = Rock, 1 = Paper, 2 = Scissors

export interface RpsState {
  round: number
  phase: 'commit' | 'reveal'
  scores: [number, number]
  drawCount: number
  commits: [boolean, boolean]
  reveals: [boolean, boolean]
  lastChoices: [RpsChoice | null, RpsChoice | null]
  commitHashes?: [Uint8Array | null, Uint8Array | null]
  room: Uint8Array | null
}

export type RpsMove =
  { type: 'commit'; room: Uint8Array; hash: Uint8Array } | { type: 'reveal'; choice: RpsChoice; salt: Uint8Array }
