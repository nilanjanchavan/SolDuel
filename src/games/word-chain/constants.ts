import { sha256 } from 'js-sha256'

export const DICTIONARY_MERKLE_ROOT = 'f487d5a4b05cdac2d44ea8b5249dc70e9001aca078040bc97d30652e2e16fe79'

export const PREFIX_FLAGS_HEX =
  'fffdff47264914992471e490547fffbf452449109926514410444ff82e44044110992653441044114110450441f4dfef7f649a4700001044064154d99f576490d542b82e4404411019245104004011411844040104'

export const PREFIX_FLAGS = new Uint8Array(PREFIX_FLAGS_HEX.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))

export const OFFSET_TURN = 0
export const OFFSET_STRIKES_0 = 1
export const OFFSET_STRIKES_1 = 2
export const OFFSET_TURN_START_TS = 3
export const OFFSET_LAST_WORD_LEN = 11
export const OFFSET_LAST_WORD = 12
export const OFFSET_WORDS_COUNT = 44
export const OFFSET_HASHES = 46

export const MAX_WORDS = 100
export const MAX_STRIKES = 4
export const WORD_CHAIN_TIMEOUT_SECS = 30

/**
 * Returns true if at least 10 words in the ENABLE1 dictionary start with the two-letter pair (c0, c1).
 */
export function hasTwoLetterPrefix(c0: string, c1: string): boolean {
  if (!c0 || !c1 || c0.length !== 1 || c1.length !== 1) return false
  const code0 = c0.toLowerCase().charCodeAt(0) - 97
  const code1 = c1.toLowerCase().charCodeAt(0) - 97
  if (code0 < 0 || code0 >= 26 || code1 < 0 || code1 >= 26) return false
  const idx = code0 * 26 + code1
  const byteIdx = Math.floor(idx / 8)
  const bitIdx = idx % 8
  if (byteIdx >= PREFIX_FLAGS.length) return false
  return ((PREFIX_FLAGS[byteIdx] >> bitIdx) & 1) === 1
}

/**
 * Computes the first 4 bytes of SHA-256(word) as a little-endian unsigned 32-bit integer.
 */
export function computeTruncatedHash(word: string): number {
  const hashBytes = sha256.array(word.toLowerCase())
  return (hashBytes[0] | (hashBytes[1] << 8) | (hashBytes[2] << 16) | (hashBytes[3] << 24)) >>> 0
}

/**
 * Verifies a word against the dictionary Merkle root using sorted pairs.
 */
export function verifyWordProof(rootHex: string, word: string, proofHexArray: string[]): boolean {
  let current = new Uint8Array(sha256.array(word.toLowerCase()))

  for (const siblingHex of proofHexArray) {
    const sibling = new Uint8Array(siblingHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [])
    if (sibling.length !== 32) return false

    let currentIsSmaller = false
    for (let i = 0; i < 32; i++) {
      if (current[i] < sibling[i]) {
        currentIsSmaller = true
        break
      } else if (current[i] > sibling[i]) {
        currentIsSmaller = false
        break
      }
    }

    const hasher = sha256.create()
    if (currentIsSmaller) {
      hasher.update(current)
      hasher.update(sibling)
    } else {
      hasher.update(sibling)
      hasher.update(current)
    }
    current = new Uint8Array(hasher.array())
  }

  const resultHex = Array.from(current)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return resultHex.toLowerCase() === rootHex.toLowerCase()
}
