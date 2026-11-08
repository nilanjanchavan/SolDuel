import { GAME_REGISTRY, GameKind } from '../src/games'

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

        const resCommit = game.engine.apply(state, 1, commitMove)
        expect(resCommit.state.commits[1]).toBe(true)

        // Bot reveal
        const revealState = {
          ...resCommit.state,
          phase: 'reveal' as const,
          commits: [true, true] as [boolean, boolean],
        }
        const revealMove = botFn(revealState, 1)
        expect(revealMove.type).toBe('reveal')
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

        const resCommit = game.engine.apply(state, 1, commitMove)
        expect(resCommit.state.commits[1]).toBe(true)

        // Bot reveal
        const revealState = {
          ...resCommit.state,
          phase: 'reveal' as const,
          commits: [true, true] as [boolean, boolean],
        }
        const revealMove = botFn(revealState, 1)
        expect(revealMove.type).toBe('reveal')
      }
    })
  })
})

