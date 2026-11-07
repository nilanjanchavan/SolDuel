import { sha256 } from 'js-sha256'
import { DiceMove, DiceState } from './types'

// Stored bot secrets per player per round
const botDiceSecrets = new Map<string, { choice: number; salt: Uint8Array }>()

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

export function getBotDiceRoll(_level: 'easy' | 'medium' | 'hard'): number {
  return Math.floor(Math.random() * 6) + 1 // 1 to 6
}

export function getBotDiceMove(level: 'easy' | 'medium' | 'hard', state: DiceState, p: 0 | 1): DiceMove {
  const room = state.room || new Uint8Array(32)
  const secretKey = `${state.round}-${p}`

  if (state.phase === 'commit') {
    const choice = getBotDiceRoll(level)
    const salt = new Uint8Array(32)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(salt)
    } else {
      for (let i = 0; i < 32; i++) salt[i] = Math.floor(Math.random() * 256)
    }

    botDiceSecrets.set(secretKey, { choice, salt })
    const hash = computeDiceHash(room, p, choice, salt)
    return { type: 'commit', room, hash }
  } else {
    const stored = botDiceSecrets.get(secretKey)
    if (stored) {
      return { type: 'reveal', choice: stored.choice, salt: stored.salt }
    }
    throw new Error(`No stored dice secret for bot at round ${state.round}, player ${p}`)
  }
}
