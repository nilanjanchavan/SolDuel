import React from 'react'
import { GameEngine, GameKind, GameUI, Outcome } from '../types'
import { WordChainMove, WordChainState } from './types'
import {
  OFFSET_HASHES,
  OFFSET_LAST_WORD,
  OFFSET_LAST_WORD_LEN,
  OFFSET_STRIKES_0,
  OFFSET_STRIKES_1,
  OFFSET_TURN,
  OFFSET_TURN_START_TS,
  OFFSET_WORDS_COUNT,
  MAX_WORDS,
  MAX_STRIKES,
  DICTIONARY_MERKLE_ROOT,
  computeTruncatedHash,
  verifyWordProof,
} from './constants'
import { createWordChainBot, getRequiredPrefix } from './bot'
import { WordChainBoard } from './ui'

export * from './types'
export * from './constants'
export * from './bot'
export * from './ui'

function awardStrike(s: WordChainState, p: 0 | 1): { state: WordChainState; outcome: Outcome } {
  const newStrikes: [number, number] = [s.strikes[0], s.strikes[1]]
  newStrikes[p] = Math.min(MAX_STRIKES, newStrikes[p] + 1)

  if (newStrikes[p] >= MAX_STRIKES) {
    return {
      state: {
        ...s,
        strikes: newStrikes,
      },
      outcome: { win: (1 - p) as 0 | 1 },
    }
  }

  return {
    state: {
      ...s,
      strikes: newStrikes,
    },
    outcome: 'continue',
  }
}

export function isFlawlessWin(state: WordChainState, winner: 0 | 1): boolean {
  return winner === 0 ? state.strikes[0] === 0 : state.strikes[1] === 0
}

export const wordChainEngine: GameEngine<WordChainState, WordChainMove> = {
  kind: GameKind.WordChain,
  isSkill: true,

  init(firstPlayer: 0 | 1): WordChainState {
    return {
      currentTurn: firstPlayer,
      strikes: [0, 0],
      turnStartTs: Date.now(),
      lastWord: '',
      wordsCount: 0,
      wordHashes: [],
    }
  },

  apply(s: WordChainState, p: 0 | 1, m: WordChainMove): { state: WordChainState; outcome: Outcome } {
    if (p !== s.currentTurn) {
      return { state: s, outcome: 'continue' }
    }

    const rawWord = typeof m === 'string' ? m : m && m.word ? m.word : ''
    const word = rawWord.trim().toLowerCase()

    // Word must be between 3 and 32 lowercase ASCII characters
    if (!word || word.length < 3 || word.length > 32 || !/^[a-z]+$/.test(word)) {
      return awardStrike(s, p)
    }

    // Verify Merkle proof if provided
    if (typeof m === 'object' && m.proof && m.proof.length > 0) {
      const isValid = verifyWordProof(DICTIONARY_MERKLE_ROOT, word, m.proof)
      if (!isValid) {
        return awardStrike(s, p)
      }
    }

    // Prefix match rule
    if (s.lastWord && s.lastWord.length >= 2) {
      const reqPrefix = getRequiredPrefix(s.lastWord)
      if (reqPrefix && !word.startsWith(reqPrefix)) {
        return awardStrike(s, p)
      }
    }

    // No repeat rule
    const hash = computeTruncatedHash(word)
    if (s.wordHashes.includes(hash)) {
      return awardStrike(s, p)
    }

    const newWordsCount = s.wordsCount + 1
    const newWordHashes = [...s.wordHashes, hash]
    const nextTurn = (1 - p) as 0 | 1

    let outcome: Outcome = 'continue'
    if (newWordsCount >= MAX_WORDS) {
      if (s.strikes[0] < s.strikes[1]) {
        outcome = { win: 0 }
      } else if (s.strikes[1] < s.strikes[0]) {
        outcome = { win: 1 }
      } else {
        outcome = 'draw'
      }
    }

    // Valid move advances the turn
    return {
      state: {
        currentTurn: nextTurn,
        strikes: s.strikes,
        turnStartTs: Date.now(),
        lastWord: word,
        wordsCount: newWordsCount,
        wordHashes: newWordHashes,
      },
      outcome,
    }
  },

  encodeAction(m: WordChainMove): Uint8Array {
    const rawWord = typeof m === 'string' ? m : m && m.word ? m.word : ''
    const word = rawWord.trim().toLowerCase()
    if (!word) {
      return new Uint8Array(0)
    }

    const proof = typeof m === 'object' && Array.isArray(m.proof) ? m.proof : []
    const wordBytes = new TextEncoder().encode(word)
    const out = new Uint8Array(2 + wordBytes.length + proof.length * 32)

    out[0] = wordBytes.length
    out.set(wordBytes, 1)
    out[1 + wordBytes.length] = proof.length

    let offset = 2 + wordBytes.length
    for (const siblingHex of proof) {
      const bytes = siblingHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || []
      if (bytes.length === 32) {
        out.set(bytes, offset)
      }
      offset += 32
    }

    return out
  },

  decodeState(buf: Uint8Array): WordChainState {
    if (!buf || buf.byteLength < 46) {
      return {
        currentTurn: 0,
        strikes: [0, 0],
        turnStartTs: 0,
        lastWord: '',
        wordsCount: 0,
        wordHashes: [],
      }
    }

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const currentTurn = (buf[OFFSET_TURN] === 1 ? 1 : 0) as 0 | 1
    const strikes: [number, number] = [buf[OFFSET_STRIKES_0], buf[OFFSET_STRIKES_1]]
    const turnStartTs = Number(view.getBigInt64(OFFSET_TURN_START_TS, true))
    const lastWordLen = Math.min(buf[OFFSET_LAST_WORD_LEN], 32)
    const lastWord = new TextDecoder().decode(buf.slice(OFFSET_LAST_WORD, OFFSET_LAST_WORD + lastWordLen))
    const wordsCount = view.getUint16(OFFSET_WORDS_COUNT, true)

    const wordHashes: number[] = []
    const count = Math.min(wordsCount, MAX_WORDS)
    for (let i = 0; i < count; i++) {
      const off = OFFSET_HASHES + i * 4
      if (off + 4 <= buf.byteLength) {
        wordHashes.push(view.getUint32(off, true))
      }
    }

    return {
      currentTurn,
      strikes,
      turnStartTs,
      lastWord,
      wordsCount,
      wordHashes,
    }
  },

  bot(level: 'easy' | 'medium' | 'hard') {
    return createWordChainBot(level)
  },
}

export const wordChainUI: GameUI<WordChainState, WordChainMove> = {
  Board(props) {
    return React.createElement(WordChainBoard, props)
  },
}
