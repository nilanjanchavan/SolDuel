import fs from 'fs'
import path from 'path'
import { rpsEngine, RpsMove, RpsChoice } from '../index'
import type { Outcome } from '../../types'

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

interface TestVector {
  players: [string, string]
  actions: string[]
  expected_outcome: 'continue' | 'draw' | { win: 0 | 1 }
  final_state_hex: string
}

describe('RPS Engine and Vectors', () => {
  const vectorFile = path.resolve(__dirname, '../../../../tests/vectors/rps.json')

  it('passes all rps test vectors and matches Rust state', () => {
    expect(fs.existsSync(vectorFile)).toBe(true)
    const raw = fs.readFileSync(vectorFile, 'utf-8')
    const vectors: TestVector[] = JSON.parse(raw)
    expect(vectors.length).toBeGreaterThan(0)

    for (const vec of vectors) {
      let state = rpsEngine.init(0)
      let currentPlayer: 0 | 1 = 0
      let lastOutcome: Outcome = 'continue'

      for (const actionHex of vec.actions) {
        const actionBytes = hexToBytes(actionHex)
        let move: RpsMove
        if (actionBytes[0] === 0) {
          move = {
            type: 'commit',
            room: actionBytes.slice(1, 33),
            hash: actionBytes.slice(33, 65),
          }
        } else {
          move = {
            type: 'reveal',
            choice: actionBytes[1] as RpsChoice,
            salt: actionBytes.slice(2, 34),
          }
        }

        const res = rpsEngine.apply(state, currentPlayer, move)
        state = res.state
        lastOutcome = res.outcome
        currentPlayer = (1 - currentPlayer) as 0 | 1
      }

      expect(lastOutcome).toEqual(vec.expected_outcome)

      const decoded = rpsEngine.decodeState(hexToBytes(vec.final_state_hex))
      expect(state.round).toBe(decoded.round)
      expect(state.phase).toBe(decoded.phase)
      expect(state.scores).toEqual(decoded.scores)
      expect(state.drawCount).toBe(decoded.drawCount)
      expect(state.commits).toEqual(decoded.commits)
      expect(state.reveals).toEqual(decoded.reveals)
      expect(state.lastChoices).toEqual(decoded.lastChoices)
    }
  })

  it('runs bots on easy, medium and hard levels without secret collisions', () => {
    const easyBot = rpsEngine.bot('easy')
    const mediumBot = rpsEngine.bot('medium')
    const hardBot = rpsEngine.bot('hard')

    // Match 1: Easy (P0) vs Hard (P1)
    const state1 = rpsEngine.init(0)
    state1.room = new Uint8Array(32).fill(7)

    const m0 = easyBot(state1, 0)
    const m1 = hardBot(state1, 1)
    expect(m0.type).toBe('commit')
    expect(m1.type).toBe('commit')

    const s1_committed = rpsEngine.apply(rpsEngine.apply(state1, 0, m0).state, 1, m1).state
    expect(s1_committed.phase).toBe('reveal')

    const r0 = easyBot(s1_committed, 0)
    const r1 = hardBot(s1_committed, 1)
    expect(r0.type).toBe('reveal')
    expect(r1.type).toBe('reveal')

    const res1 = rpsEngine.apply(rpsEngine.apply(s1_committed, 0, r0).state, 1, r1)
    expect(['continue', 'draw', { win: 0 }, { win: 1 }]).toContainEqual(res1.outcome)

    // Match 2: Medium (P0) vs Hard (P1) on a distinct round to prevent secret collision
    const state2 = rpsEngine.init(0)
    state2.round = 1
    state2.room = new Uint8Array(32).fill(8)

    const mMed0 = mediumBot(state2, 0)
    const mHard1 = hardBot(state2, 1)
    const s2_committed = rpsEngine.apply(rpsEngine.apply(state2, 0, mMed0).state, 1, mHard1).state
    const rMed0 = mediumBot(s2_committed, 0)
    const rHard1 = hardBot(s2_committed, 1)
    const res2 = rpsEngine.apply(rpsEngine.apply(s2_committed, 0, rMed0).state, 1, rHard1)
    expect(['continue', 'draw', { win: 0 }, { win: 1 }]).toContainEqual(res2.outcome)
  })

  it('rejects malformed inputs and forfeits on invalid reveal or hash mismatch', () => {
    const state = rpsEngine.init(0)
    const room = new Uint8Array(32).fill(1)
    state.room = room
    const salt0 = new Uint8Array(32).fill(10)

    // 1. Reveal during commit phase throws
    expect(() => rpsEngine.apply(state, 0, { type: 'reveal', choice: 0, salt: salt0 })).toThrow()

    // Valid commit P0
    const m0: RpsMove = {
      type: 'commit',
      room,
      hash: rpsEngine.encodeAction({ type: 'reveal', choice: 0, salt: salt0 }).slice(2), // placeholder
    }
    const s1 = rpsEngine.apply(state, 0, m0).state

    // 2. Double commit by P0 throws
    expect(() => rpsEngine.apply(s1, 0, m0)).toThrow()

    // 3. Choice out of range in reveal forfeits
    const sReveal = { ...s1, phase: 'reveal' as const, commits: [true, true] as [boolean, boolean] }
    const outOutOfRange = rpsEngine.apply(sReveal, 0, { type: 'reveal', choice: 3 as RpsChoice, salt: salt0 }).outcome
    expect(outOutOfRange).toEqual({ win: 1 })

    // 4. Reveal with hash mismatch forfeits to opponent
    const realHash = new Uint8Array(32).fill(99)
    const sWithHash: typeof sReveal = { ...sReveal, commitHashes: [realHash, null] }
    const outMismatch = rpsEngine.apply(sWithHash, 0, { type: 'reveal', choice: 0, salt: salt0 }).outcome
    expect(outMismatch).toEqual({ win: 1 })

    // 5. decodeState on short buffer throws
    expect(() => rpsEngine.decodeState(new Uint8Array(50))).toThrow()
  })
})
