import { sha256 } from 'js-sha256'
import { RpsChoice, RpsMove, RpsState } from './types'

// Stored bot secrets per player per round
const botSecrets = new Map<string, { choice: RpsChoice; salt: Uint8Array }>()

// History of player moves to counter habits
const playerMoveHistory: RpsChoice[] = []

export function computeRpsHash(room: Uint8Array, player: 0 | 1, choice: RpsChoice, salt: Uint8Array): Uint8Array {
  const preimage = new Uint8Array(32 + 2 + 32)
  preimage.set(room, 0)
  preimage[32] = player
  preimage[33] = choice
  preimage.set(salt, 34)
  const hashHex = sha256(preimage)
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function recordHumanMove(choice: RpsChoice): void {
  playerMoveHistory.push(choice)
  if (playerMoveHistory.length > 20) {
    playerMoveHistory.shift()
  }
}

/**
 * Hard RPS Bot: Uses Win-Stay Lose-Shift (WSLS) heuristics and Markov transition
 * analysis to counter psychological human habits.
 */
function getHardChoice(history: RpsChoice[]): RpsChoice {
  if (history.length === 0) {
    // Statistically humans open with Rock (>35%), so Hard bot opens with Paper (1)
    return 1
  }

  const lastMove = history[history.length - 1]

  // If we have at least 2 moves, check if player is cycling or repeating
  if (history.length >= 2) {
    const prevMove = history[history.length - 2]
    if (prevMove === lastMove) {
      // Player repeated move twice, highly unlikely to repeat a third time
      // They usually shift to what beats their move or cycles
      const predictedNext = ((lastMove + 1) % 3) as RpsChoice
      return ((predictedNext + 1) % 3) as RpsChoice // Counter the shift
    }
  }

  // Frequency analysis of transitions from lastMove
  const nextCounts = [0, 0, 0]
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i] === lastMove) {
      nextCounts[history[i + 1]]++
    }
  }

  const mostFrequentNext =
    nextCounts[0] >= nextCounts[1] ? (nextCounts[0] >= nextCounts[2] ? 0 : 2) : nextCounts[1] >= nextCounts[2] ? 1 : 2

  if (nextCounts[mostFrequentNext] > 0) {
    return ((mostFrequentNext + 1) % 3) as RpsChoice
  }

  // Default Win-Stay counter: predict player repeats last move, counter with (lastMove + 1) % 3
  return ((lastMove + 1) % 3) as RpsChoice
}

export function getBotChoice(level: 'easy' | 'medium' | 'hard'): RpsChoice {
  if (level === 'easy') {
    return Math.floor(Math.random() * 3) as RpsChoice
  }

  if (level === 'medium') {
    // 50% random, 50% habit counter
    if (Math.random() < 0.5) {
      return Math.floor(Math.random() * 3) as RpsChoice
    }
    return getHardChoice(playerMoveHistory)
  }

  return getHardChoice(playerMoveHistory)
}

export function getBotRpsMove(level: 'easy' | 'medium' | 'hard', state: RpsState, p: 0 | 1): RpsMove {
  const room = state.room || new Uint8Array(32)
  const secretKey = `${state.round}-${p}`

  if (state.phase === 'commit') {
    const choice = getBotChoice(level)
    const salt = new Uint8Array(32)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(salt)
    } else {
      for (let i = 0; i < 32; i++) salt[i] = Math.floor(Math.random() * 256)
    }

    botSecrets.set(secretKey, { choice, salt })
    const hash = computeRpsHash(room, p, choice, salt)
    return { type: 'commit', room, hash }
  } else {
    const stored = botSecrets.get(secretKey)
    if (stored) {
      return { type: 'reveal', choice: stored.choice, salt: stored.salt }
    }
    throw new Error(`No stored RPS secret for bot at round ${state.round}, player ${p}`)
  }
}
