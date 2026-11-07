export interface WordChainState {
  currentTurn: 0 | 1
  strikes: [number, number]
  turnStartTs: number
  lastWord: string
  wordsCount: number
  wordHashes: number[]
}

export interface WordChainMoveObject {
  word: string
  proof?: string[]
}

export type WordChainMove = string | WordChainMoveObject
