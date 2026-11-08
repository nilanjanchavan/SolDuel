import { sha256 } from 'js-sha256'
import { RpsChoice, RpsMove, RpsState } from './types'

// Stored bot secrets per player per round / commit hash
const botSecrets = new Map<string, { choice: RpsChoice; salt: Uint8Array }>()

// History of player moves to counter habits
const playerMoveHistory: RpsChoice[] = []

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Computes the SHA-256 commit hash for rock-paper-scissors: room || player || choice || salt (66 bytes).
 *
 * @param room 32-byte room address
 * @param player Player index 0 or 1
 * @param choice RpsChoice (0=Rock, 1=Paper, 2=Scissors)
 * @param salt 32-byte random salt
 * @returns 32-byte SHA-256 commit hash
 */
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

/**
 * Records a human move to the history buffer for predictive analysis by the hard bot.
 *
 * @param choice RpsChoice played by the human
 */
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

/**
 * Selects an RPS choice for the bot according to the given difficulty level.
 *
 * @param level 'easy', 'medium', or 'hard'
 * @returns RpsChoice (0=Rock, 1=Paper, 2=Scissors)
 */
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

/**
 * Computes the next RPS move (commit or reveal) for the bot.
 *
 * @param level Bot difficulty level
 * @param state Current RPS game state
 * @param p Bot's player index (0 or 1)
 * @returns RpsMove (commit or reveal)
 */
export function getBotRpsMove(level: 'easy' | 'medium' | 'hard', state: RpsState, p: 0 | 1): RpsMove {
  const room = state.room || new Uint8Array(32)
  const secretKey = `${state.round}-${p}`

  if (state.phase === 'commit') {
    const choice = getBotChoice(level)
    const salt = new Uint8Array(32)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(salt)
    } else {
      throw new Error('Secure randomness unavailable for RPS bot salt generation')
    }

    const hash = computeRpsHash(room, p, choice, salt)
    const hashHex = bytesToHex(hash)
    botSecrets.set(secretKey, { choice, salt })
    botSecrets.set(hashHex, { choice, salt })
    return { type: 'commit', room, hash }
  } else {
    const hashHex = state.commitHashes?.[p] ? bytesToHex(state.commitHashes[p]!) : null
    const stored = (hashHex && botSecrets.get(hashHex)) || botSecrets.get(secretKey)
    if (stored) {
      return { type: 'reveal', choice: stored.choice, salt: stored.salt }
    }
    throw new Error(`No stored RPS secret for bot at round ${state.round}, player ${p}`)
  }
}
