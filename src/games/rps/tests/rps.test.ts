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

  it('runs bots on easy, medium and hard levels', () => {
    const easyBot = rpsEngine.bot('easy')
    const mediumBot = rpsEngine.bot('medium')
    const hardBot = rpsEngine.bot('hard')

    const state = rpsEngine.init(0)
    state.room = new Uint8Array(32).fill(7)

    const m0 = easyBot(state, 0)
    expect(m0.type).toBe('commit')

    const m1 = hardBot(state, 1)
    expect(m1.type).toBe('commit')

    const mMed = mediumBot(state, 1)
    expect(mMed.type).toBe('commit')

    const s1 = rpsEngine.apply(state, 0, m0).state
    const s2 = rpsEngine.apply(s1, 1, m1).state
    expect(s2.phase).toBe('reveal')

    const r0 = easyBot(s2, 0)
    expect(r0.type).toBe('reveal')

    const r1 = hardBot(s2, 1)
    expect(r1.type).toBe('reveal')

    const outcome = rpsEngine.apply(rpsEngine.apply(s2, 0, r0).state, 1, r1).outcome
    expect(['continue', 'draw', { win: 0 }, { win: 1 }]).toContainEqual(outcome)
  })
})
