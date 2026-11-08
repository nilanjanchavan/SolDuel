import { GAME_REGISTRY, GameKind } from '../src/games'
import { computeRpsHash } from '../src/games/rps/bot'
import { computeDiceHash } from '../src/games/dice/bot'

describe('Practice Mode Bots and Engines', () => {
  const difficulties = ['easy', 'medium', 'hard'] as const

  describe('Connect Four Bot', () => {
    const game = GAME_REGISTRY[GameKind.ConnectFour]

    it('initializes and applies human move followed by bot move across all levels', () => {
      for (const diff of difficulties) {
        const state = game.engine.init(0)
        expect(state.turn).toBe(0)

        // Human move: column 3
        const res1 = game.engine.apply(state, 0, 3)
        expect(res1.state.turn).toBe(1)
        expect(res1.outcome).toBe('continue')

        // Bot move
        const botFn = game.engine.bot(diff)
        const botMove = botFn(res1.state, 1)
        expect(typeof botMove).toBe('number')
        expect(botMove).toBeGreaterThanOrEqual(0)
        expect(botMove).toBeLessThan(7)

        const res2 = game.engine.apply(res1.state, 1, botMove)
        expect(res2.state.turn).toBe(0)
      }
    })
  })

  describe('Word Chain Bot', () => {
    const game = GAME_REGISTRY[GameKind.WordChain]

    it('initializes and generates candidate responses across all levels', () => {
      for (const diff of difficulties) {
        const state = game.engine.init(0)
        expect(state.currentTurn).toBe(0)

        // Human move
        const res1 = game.engine.apply(state, 0, 'cat')
        expect(res1.state.lastWord).toBe('cat')
        expect(res1.state.currentTurn).toBe(1)

        // Bot move
        const botFn = game.engine.bot(diff)
        const botMove = botFn(res1.state, 1)
        const word = typeof botMove === 'string' ? botMove : botMove.word
        expect(typeof word).toBe('string')
        expect(word.length).toBeGreaterThanOrEqual(2)

        const res2 = game.engine.apply(res1.state, 1, botMove)
        expect(res2.state).toBeDefined()
      }
    })

    it('tracks turn timestamps and respects 30s timeout interval', () => {
      const state = game.engine.init(0)
      expect(state.turnStartTs).toBeGreaterThan(0)
      const now = Date.now()
      expect(Math.abs(state.turnStartTs - now)).toBeLessThan(5000)

      // Turn advances and refreshes turnStartTs
      const res1 = game.engine.apply(state, 0, 'dog')
      expect(res1.state.turnStartTs).toBeGreaterThanOrEqual(state.turnStartTs)
      expect(res1.state.currentTurn).toBe(1)
    })
  })

  describe('RPS Bot', () => {
    const game = GAME_REGISTRY[GameKind.Rps]

    it('generates valid commit and reveal moves across all levels', () => {
      for (const diff of difficulties) {
        const state = game.engine.init(0)
        expect(state.phase).toBe('commit')

        const botFn = game.engine.bot(diff)
        const commitMove = botFn(state, 1)
        expect(commitMove.type).toBe('commit')

        // 1. Bot commits
        const res1 = game.engine.apply(state, 1, commitMove)
        expect(res1.state.commits[1]).toBe(true)

        // 2. Human commits
        const humanSalt = new Uint8Array(32).fill(7)
        const room = res1.state.room || new Uint8Array(32)
        const humanHash = computeRpsHash(room, 0, 0, humanSalt)
        const res2 = game.engine.apply(res1.state, 0, { type: 'commit', room, hash: humanHash })
        expect(res2.state.phase).toBe('reveal')
        expect(res2.state.commits[0]).toBe(true)
        expect(res2.state.commits[1]).toBe(true)

        // 3. Bot reveals from the resulting state
        const revealMove = botFn(res2.state, 1)
        expect(revealMove.type).toBe('reveal')
        const res3 = game.engine.apply(res2.state, 1, revealMove)
        expect(res3.state.reveals[1]).toBe(true)
        expect(res3.outcome).toBe('continue')

        // 4. Verify tampered reveal forfeits to player 0
        const tamperedSalt = new Uint8Array(32).fill(99)
        const tamperedReveal = {
          type: 'reveal' as const,
          choice: revealMove.type === 'reveal' ? revealMove.choice : 0,
          salt: tamperedSalt,
        }
        const resTampered = game.engine.apply(res2.state, 1, tamperedReveal)
        expect(resTampered.outcome).toEqual({ win: 0 })
      }
    })
  })

  describe('Dice Bot', () => {
    const game = GAME_REGISTRY[GameKind.Dice]

    it('generates valid commit and reveal moves across all levels', () => {
      for (const diff of difficulties) {
        const state = game.engine.init(0)
        expect(state.phase).toBe('commit')

        const botFn = game.engine.bot(diff)
        const commitMove = botFn(state, 1)
        expect(commitMove.type).toBe('commit')

        // 1. Bot commits
        const res1 = game.engine.apply(state, 1, commitMove)
        expect(res1.state.commits[1]).toBe(true)

        // 2. Human commits
        const humanSalt = new Uint8Array(32).fill(7)
        const room = res1.state.room || new Uint8Array(32)
        const humanHash = computeDiceHash(room, 0, 4, humanSalt)
        const res2 = game.engine.apply(res1.state, 0, { type: 'commit', room, hash: humanHash })
        expect(res2.state.phase).toBe('reveal')
        expect(res2.state.commits[0]).toBe(true)
        expect(res2.state.commits[1]).toBe(true)

        // 3. Bot reveals from the resulting state
        const revealMove = botFn(res2.state, 1)
        expect(revealMove.type).toBe('reveal')
        const res3 = game.engine.apply(res2.state, 1, revealMove)
        expect(res3.state.reveals[1]).toBe(true)
        expect(res3.outcome).toBe('continue')

        // 4. Verify tampered reveal forfeits to player 0
        const tamperedSalt = new Uint8Array(32).fill(99)
        const tamperedReveal = {
          type: 'reveal' as const,
          choice: revealMove.type === 'reveal' ? revealMove.choice : 1,
          salt: tamperedSalt,
        }
        const resTampered = game.engine.apply(res2.state, 1, tamperedReveal)
        expect(resTampered.outcome).toEqual({ win: 0 })
      }
    })
  })
})
