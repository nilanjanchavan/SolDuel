import fs from 'fs'
import path from 'path'
import { diceEngine, DiceMove } from '../index'
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

describe('Dice Engine and Vectors', () => {
  const vectorFile = path.resolve(__dirname, '../../../../tests/vectors/dice.json')

  it('passes all dice test vectors and matches Rust state', () => {
    expect(fs.existsSync(vectorFile)).toBe(true)
    const raw = fs.readFileSync(vectorFile, 'utf-8')
    const vectors: TestVector[] = JSON.parse(raw)
    expect(vectors.length).toBeGreaterThan(0)

    for (const vec of vectors) {
      let state = diceEngine.init(0)
      let currentPlayer: 0 | 1 = 0
      let lastOutcome: Outcome = 'continue'

      for (const actionHex of vec.actions) {
        const actionBytes = hexToBytes(actionHex)
        let move: DiceMove
        if (actionBytes[0] === 0) {
          move = {
            type: 'commit',
            room: actionBytes.slice(1, 33),
            hash: actionBytes.slice(33, 65),
          }
        } else {
          move = {
            type: 'reveal',
            choice: actionBytes[1],
            salt: actionBytes.slice(2, 34),
          }
        }

        const res = diceEngine.apply(state, currentPlayer, move)
        state = res.state
        lastOutcome = res.outcome
        currentPlayer = (1 - currentPlayer) as 0 | 1
      }

      expect(lastOutcome).toEqual(vec.expected_outcome)

      const decoded = diceEngine.decodeState(hexToBytes(vec.final_state_hex))
      expect(state.round).toBe(decoded.round)
      expect(state.phase).toBe(decoded.phase)
      expect(state.rolls).toEqual(decoded.rolls)
      expect(state.drawCount).toBe(decoded.drawCount)
      expect(state.commits).toEqual(decoded.commits)
      expect(state.reveals).toEqual(decoded.reveals)
    }
  })

  it('runs bots on easy, medium and hard levels without secret collisions', () => {
    const easyBot = diceEngine.bot('easy')
    const mediumBot = diceEngine.bot('medium')
    const hardBot = diceEngine.bot('hard')

    // Match 1: Easy (P0) vs Hard (P1)
    const state1 = diceEngine.init(0)
    state1.room = new Uint8Array(32).fill(9)

    const m0 = easyBot(state1, 0)
    const m1 = hardBot(state1, 1)
    expect(m0.type).toBe('commit')
    expect(m1.type).toBe('commit')

    const s1_committed = diceEngine.apply(diceEngine.apply(state1, 0, m0).state, 1, m1).state
    expect(s1_committed.phase).toBe('reveal')

    const r0 = easyBot(s1_committed, 0)
    const r1 = hardBot(s1_committed, 1)
    expect(r0.type).toBe('reveal')
    expect(r1.type).toBe('reveal')

    const res1 = diceEngine.apply(diceEngine.apply(s1_committed, 0, r0).state, 1, r1)
    expect(['continue', 'draw', { win: 0 }, { win: 1 }]).toContainEqual(res1.outcome)

    // Match 2: Medium (P0) vs Hard (P1) on a distinct round
    const state2 = diceEngine.init(0)
    state2.round = 1
    state2.room = new Uint8Array(32).fill(11)

    const mMed0 = mediumBot(state2, 0)
    const mHard1 = hardBot(state2, 1)
    const s2_committed = diceEngine.apply(diceEngine.apply(state2, 0, mMed0).state, 1, mHard1).state
    const rMed0 = mediumBot(s2_committed, 0)
    const rHard1 = hardBot(s2_committed, 1)
    const res2 = diceEngine.apply(diceEngine.apply(s2_committed, 0, rMed0).state, 1, rHard1)
    expect(['continue', 'draw', { win: 0 }, { win: 1 }]).toContainEqual(res2.outcome)
  })

  it('rejects malformed inputs and forfeits on invalid roll or hash mismatch', () => {
    const state = diceEngine.init(0)
    const room = new Uint8Array(32).fill(2)
    state.room = room
    const salt0 = new Uint8Array(32).fill(15)

    // 1. Reveal during commit phase throws
    expect(() => diceEngine.apply(state, 0, { type: 'reveal', choice: 4, salt: salt0 })).toThrow()

    // Valid commit P0
    const m0: DiceMove = {
      type: 'commit',
      room,
      hash: new Uint8Array(32).fill(42),
    }
    const s1 = diceEngine.apply(state, 0, m0).state

    // 2. Double commit by P0 throws
    expect(() => diceEngine.apply(s1, 0, m0)).toThrow()

    // 3. Roll out of range (0, 7, non-integer) in reveal forfeits
    const sReveal = { ...s1, phase: 'reveal' as const, commits: [true, true] as [boolean, boolean] }
    expect(diceEngine.apply(sReveal, 0, { type: 'reveal', choice: 0, salt: salt0 }).outcome).toEqual({ win: 1 })
    expect(diceEngine.apply(sReveal, 0, { type: 'reveal', choice: 7, salt: salt0 }).outcome).toEqual({ win: 1 })
    expect(diceEngine.apply(sReveal, 0, { type: 'reveal', choice: 2.5, salt: salt0 }).outcome).toEqual({ win: 1 })

    // 4. Reveal with hash mismatch forfeits to opponent
    const realHash = new Uint8Array(32).fill(99)
    const sWithHash = { ...sReveal, commitHashes: [realHash, null] as [Uint8Array | null, Uint8Array | null] }
    expect(diceEngine.apply(sWithHash, 0, { type: 'reveal', choice: 4, salt: salt0 }).outcome).toEqual({ win: 1 })

    // 5. decodeState on short buffer throws
    expect(() => diceEngine.decodeState(new Uint8Array(50))).toThrow()
  })
})
