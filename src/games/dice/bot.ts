import { sha256 } from 'js-sha256'
import { DiceMove, DiceState } from './types'

// Stored bot secrets per player per round / commit hash
const botDiceSecrets = new Map<string, { choice: number; salt: Uint8Array }>()

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Computes the SHA-256 commit hash for dice duel: room || player || choice || salt (66 bytes).
 *
 * @param room 32-byte room address
 * @param player Player index 0 or 1
 * @param choice Chosen roll (1..=6)
 * @param salt 32-byte random salt
 * @returns 32-byte SHA-256 commit hash
 */
export function computeDiceHash(room: Uint8Array, player: 0 | 1, choice: number, salt: Uint8Array): Uint8Array {
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
 * Returns a random die roll between 1 and 6 for the bot.
 *
 * @param _level Bot difficulty level
 * @returns Integer from 1 to 6
 */
export function getBotDiceRoll(_level: 'easy' | 'medium' | 'hard'): number {
  return Math.floor(Math.random() * 6) + 1 // 1 to 6
}

/**
 * Computes the next action (commit or reveal) for the dice bot at the given level.
 *
 * @param level Bot difficulty level
 * @param state Current game state
 * @param p Bot's player index (0 or 1)
 * @returns Dice commit or reveal move
 */
export function getBotDiceMove(level: 'easy' | 'medium' | 'hard', state: DiceState, p: 0 | 1): DiceMove {
  const room = state.room || new Uint8Array(32)
  const secretKey = `${state.round}-${p}`

  if (state.phase === 'commit') {
    const choice = getBotDiceRoll(level)
    const salt = new Uint8Array(32)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(salt)
    } else {
      throw new Error('Secure randomness unavailable for dice bot salt generation')
    }

    const hash = computeDiceHash(room, p, choice, salt)
    const hashHex = bytesToHex(hash)
    botDiceSecrets.set(secretKey, { choice, salt })
    botDiceSecrets.set(hashHex, { choice, salt })
    return { type: 'commit', room, hash }
  } else {
    const hashHex = state.commitHashes?.[p] ? bytesToHex(state.commitHashes[p]!) : null
    const stored = (hashHex && botDiceSecrets.get(hashHex)) || botDiceSecrets.get(secretKey)
    if (stored) {
      return { type: 'reveal', choice: stored.choice, salt: stored.salt }
    }
    throw new Error(`No stored dice secret for bot at round ${state.round}, player ${p}`)
  }
}
