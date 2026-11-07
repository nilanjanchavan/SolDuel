import fs from 'fs'
import path from 'path'
import { Outcome } from '../../types'
import { wordChainEngine, hasTwoLetterPrefix, isFlawlessWin, verifyWordProof, DICTIONARY_MERKLE_ROOT } from '../index'

describe('Word Chain Engine & Vectors', () => {
  const vectorsPath = path.join(process.cwd(), 'tests', 'vectors', 'word_chain.json')

  it('verifies all shared vectors in tests/vectors/word_chain.json', () => {
    expect(fs.existsSync(vectorsPath)).toBe(true)
    const raw = fs.readFileSync(vectorsPath, 'utf-8')
    const vectors = JSON.parse(raw)
    expect(Array.isArray(vectors)).toBe(true)
    expect(vectors.length).toBeGreaterThan(0)

    for (let idx = 0; idx < vectors.length; idx++) {
      const vec = vectors[idx]
      let state = wordChainEngine.init(0)
      let outcome: Outcome = 'continue'

      for (const actionHex of vec.actions) {
        const actionBytes = Buffer.from(actionHex, 'hex')
        const currentTurn = state.currentTurn

        let word = ''
        const proof: string[] = []

        if (actionBytes.length > 0) {
          const wordLen = actionBytes[0]
          word = new TextDecoder().decode(actionBytes.subarray(1, 1 + wordLen))
          const proofLen = actionBytes[1 + wordLen]
          let off = 2 + wordLen
          for (let p = 0; p < proofLen; p++) {
            proof.push(Buffer.from(actionBytes.subarray(off, off + 32)).toString('hex'))
            off += 32
          }
        }

        const move = proof.length > 0 ? { word, proof } : word
        const res = wordChainEngine.apply(state, currentTurn, move)
        state = res.state
        outcome = res.outcome
      }

      // Check outcome matches expected
      expect(outcome).toEqual(vec.expected_outcome)

      // Verify decoded final state fields match Rust state
      const finalStateBuf = Buffer.from(vec.final_state_hex, 'hex')
      const decodedRustState = wordChainEngine.decodeState(new Uint8Array(finalStateBuf))

      expect(state.currentTurn).toBe(decodedRustState.currentTurn)
      expect(state.strikes).toEqual(decodedRustState.strikes)
      expect(state.lastWord).toBe(decodedRustState.lastWord)
      expect(state.wordsCount).toBe(decodedRustState.wordsCount)
      expect(state.wordHashes).toEqual(decodedRustState.wordHashes)
    }
  })

  describe('Prefix flags & 2-letter rule', () => {
    it('accurately distinguishes high-frequency prefixes from rare prefixes', () => {
      // ng: only 3 words (< 10) -> flag must be false
      expect(hasTwoLetterPrefix('n', 'g')).toBe(false)

      // st: thousands of words (>= 10) -> flag must be true
      expect(hasTwoLetterPrefix('s', 't')).toBe(true)

      // in: >= 10 words -> true
      expect(hasTwoLetterPrefix('i', 'n')).toBe(true)

      // to: >= 10 words -> true
      expect(hasTwoLetterPrefix('t', 'o')).toBe(true)

      // Invalid character boundaries
      expect(hasTwoLetterPrefix('1', 'a')).toBe(false)
      expect(hasTwoLetterPrefix('a', '!')).toBe(false)
      expect(hasTwoLetterPrefix('', 'a')).toBe(false)
    })
  })

  describe('Word validation & strikes rules', () => {
    it('awards strikes for short words (< 3 letters) and keeps turn', () => {
      const state = wordChainEngine.init(0)
      expect(state.currentTurn).toBe(0)
      expect(state.strikes).toEqual([0, 0])

      // 2-letter word
      const res1 = wordChainEngine.apply(state, 0, 'hi')
      expect(res1.outcome).toBe('continue')
      expect(res1.state.strikes).toEqual([1, 0])
      expect(res1.state.currentTurn).toBe(0) // Turn does not change

      // Uppercase or invalid characters
      const res2 = wordChainEngine.apply(res1.state, 0, 'CAT')
      // 'CAT' lowercases to 'cat' which is valid
      expect(res2.state.lastWord).toBe('cat')
      expect(res2.state.currentTurn).toBe(1)

      // Player 1 plays invalid word with numbers
      const res3 = wordChainEngine.apply(res2.state, 1, 'cat2')
      expect(res3.state.strikes).toEqual([1, 1])
      expect(res3.state.currentTurn).toBe(1)
    })

    it('enforces prefix rules based on previous word ending', () => {
      let state = wordChainEngine.init(0)

      // P0 plays "start" (ends with "rt" -> flag=0 -> next starts with "t")
      const r0 = wordChainEngine.apply(state, 0, 'start')
      state = r0.state
      expect(state.lastWord).toBe('start')
      expect(state.currentTurn).toBe(1)

      // P1 plays word starting with "w" instead of "t" -> strike!
      const r1 = wordChainEngine.apply(state, 1, 'water')
      expect(r1.outcome).toBe('continue')
      expect(r1.state.strikes).toEqual([0, 1])
      expect(r1.state.currentTurn).toBe(1) // P1 retains turn

      // P1 recovers with "train" (starts with "t", ends with "in", flag=1 -> next starts with "in")
      const r2 = wordChainEngine.apply(r1.state, 1, 'train')
      state = r2.state
      expect(state.lastWord).toBe('train')
      expect(state.currentTurn).toBe(0)

      // P0 plays "into" (starts with "in") -> valid!
      const r3 = wordChainEngine.apply(state, 0, 'into')
      state = r3.state
      expect(state.lastWord).toBe('into')
      expect(state.currentTurn).toBe(1)
    })

    it('prevents repeated words via truncated hash check', () => {
      let state = wordChainEngine.init(0)

      const r0 = wordChainEngine.apply(state, 0, 'start')
      state = r0.state

      // P1 tries to repeat "start" -> strike!
      const r1 = wordChainEngine.apply(state, 1, 'start')
      expect(r1.state.strikes).toEqual([0, 1])
      expect(r1.state.currentTurn).toBe(1)
    })

    it('awards win to opponent when 4 strikes are accumulated', () => {
      let state = wordChainEngine.init(0)

      // P0 plays 3 invalid words
      for (let i = 0; i < 3; i++) {
        const res = wordChainEngine.apply(state, 0, '')
        expect(res.outcome).toBe('continue')
        state = res.state
        expect(state.strikes[0]).toBe(i + 1)
        expect(state.currentTurn).toBe(0)
      }

      // 4th strike loses match
      const finalRes = wordChainEngine.apply(state, 0, '')
      expect(finalRes.outcome).toEqual({ win: 1 })
      expect(finalRes.state.strikes[0]).toBe(4)

      // Flawless win check: P1 won with 0 strikes
      expect(isFlawlessWin(finalRes.state, 1)).toBe(true)
      expect(isFlawlessWin(finalRes.state, 0)).toBe(false)
    })
  })

  describe('Merkle verification & Proofs', () => {
    it('verifies dictionary Merkle root with valid proofs', () => {
      const raw = fs.readFileSync(vectorsPath, 'utf-8')
      const vectors = JSON.parse(raw)
      const actionHex = vectors[0].actions[0]
      const actionBytes = Buffer.from(actionHex, 'hex')
      const wordLen = actionBytes[0]
      const word = new TextDecoder().decode(actionBytes.subarray(1, 1 + wordLen))
      const proofLen = actionBytes[1 + wordLen]
      const proof: string[] = []
      let off = 2 + wordLen
      for (let i = 0; i < proofLen; i++) {
        proof.push(Buffer.from(actionBytes.subarray(off, off + 32)).toString('hex'))
        off += 32
      }

      expect(verifyWordProof(DICTIONARY_MERKLE_ROOT, word, proof)).toBe(true)

      // Tampered proof should fail
      const tamperedProof = [...proof]
      tamperedProof[0] = '0000000000000000000000000000000000000000000000000000000000000000'
      expect(verifyWordProof(DICTIONARY_MERKLE_ROOT, word, tamperedProof)).toBe(false)
    })
  })

  describe('Action Encoding & State Decoding', () => {
    it('encodes and decodes actions matching Rust layout', () => {
      const move = {
        word: 'start',
        proof: ['1111111111111111111111111111111111111111111111111111111111111111'],
      }
      const encoded = wordChainEngine.encodeAction(move)
      expect(encoded[0]).toBe(5) // word_len
      expect(new TextDecoder().decode(encoded.subarray(1, 6))).toBe('start')
      expect(encoded[6]).toBe(1) // proof_len
      expect(encoded.length).toBe(2 + 5 + 32)

      // Empty move encodes to 0 bytes
      const emptyEncoded = wordChainEngine.encodeAction('')
      expect(emptyEncoded.length).toBe(0)
    })

    it('safely decodes empty or partial state buffers', () => {
      const emptyBuf = new Uint8Array(20)
      const decoded = wordChainEngine.decodeState(emptyBuf)
      expect(decoded.currentTurn).toBe(0)
      expect(decoded.strikes).toEqual([0, 0])
      expect(decoded.lastWord).toBe('')
    })
  })

  describe('Bot logic across difficulty levels', () => {
    it('easy bot generates opening and chain moves', () => {
      const bot = wordChainEngine.bot('easy')
      const s0 = wordChainEngine.init(0)
      const move0 = bot(s0, 0)
      expect(typeof move0 === 'string' || typeof move0 === 'object').toBe(true)

      const word0 = typeof move0 === 'string' ? move0 : move0.word
      expect(word0.length).toBeGreaterThanOrEqual(2)
    })

    it('medium bot generates valid continuation moves', () => {
      const bot = wordChainEngine.bot('medium')
      let state = wordChainEngine.init(0)
      const r0 = wordChainEngine.apply(state, 0, 'start')
      state = r0.state

      const move = bot(state, 1)
      const word = typeof move === 'string' ? move : move.word
      expect(word.length).toBeGreaterThanOrEqual(2)
    })

    it('hard bot generates valid words with zero slips', () => {
      const bot = wordChainEngine.bot('hard')
      let state = wordChainEngine.init(0)
      const r0 = wordChainEngine.apply(state, 0, 'start')
      state = r0.state

      for (let i = 0; i < 5; i++) {
        const move = bot(state, 1)
        const word = typeof move === 'string' ? move : move.word
        expect(word.length).toBeGreaterThanOrEqual(3)
        expect(word.startsWith('t')).toBe(true)
      }
    })
  })
})
