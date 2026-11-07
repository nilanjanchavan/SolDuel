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

  it('runs bots on easy, medium and hard levels', () => {
    const easyBot = diceEngine.bot('easy')
    const mediumBot = diceEngine.bot('medium')
    const hardBot = diceEngine.bot('hard')

    const state = diceEngine.init(0)
    state.room = new Uint8Array(32).fill(9)

    const m0 = easyBot(state, 0)
    expect(m0.type).toBe('commit')

    const m1 = hardBot(state, 1)
    expect(m1.type).toBe('commit')

    const mMed = mediumBot(state, 1)
    expect(mMed.type).toBe('commit')

    const s1 = diceEngine.apply(state, 0, m0).state
    const s2 = diceEngine.apply(s1, 1, m1).state
    expect(s2.phase).toBe('reveal')

    const r0 = easyBot(s2, 0)
    expect(r0.type).toBe('reveal')

    const r1 = hardBot(s2, 1)
    expect(r1.type).toBe('reveal')

    const outcome = diceEngine.apply(diceEngine.apply(s2, 0, r0).state, 1, r1).outcome
    expect(['continue', 'draw', { win: 0 }, { win: 1 }]).toContainEqual(outcome)
  })
})
