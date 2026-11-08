import React from 'react'
import { GameEngine, GameKind, GameUI, Outcome } from '../types'
import { RpsChoice, RpsMove, RpsState } from './types'
import { getBotRpsMove, computeRpsHash } from './bot'
import { RpsBoard } from './ui'

export * from './types'
export * from './bot'
export * from './ui'

export const TARGET_WINS = 2
export const MAX_DRAWS = 5
export const MAX_TOTAL_ROUNDS = 9

export function rpsBeats(a: RpsChoice, b: RpsChoice): boolean {
  return (a === 0 && b === 2) || (a === 1 && b === 0) || (a === 2 && b === 1)
}

export const rpsEngine: GameEngine<RpsState, RpsMove> = {
  kind: GameKind.Rps,
  isSkill: false,

  init(_firstPlayer: 0 | 1): RpsState {
    return {
      round: 0,
      phase: 'commit',
      scores: [0, 0],
      drawCount: 0,
      commits: [false, false],
      reveals: [false, false],
      lastChoices: [null, null],
      commitHashes: [null, null],
      room: null,
    }
  },

  apply(s: RpsState, p: 0 | 1, m: RpsMove): { state: RpsState; outcome: Outcome } {
    if (m.type === 'commit') {
      if (s.phase !== 'commit') {
        throw new Error('Not commit phase')
      }
      if (s.commits[p]) {
        throw new Error(`Player ${p} already committed`)
      }
      if (!m.room || m.room.length !== 32 || !m.hash || m.hash.length !== 32) {
        throw new Error('Invalid commit payload: room and hash must each be 32 bytes')
      }
      if (s.room) {
        let roomMismatch = false
        for (let i = 0; i < 32; i++) {
          if (s.room[i] !== m.room[i]) {
            roomMismatch = true
            break
          }
        }
        if (roomMismatch) {
          throw new Error('Commit room does not match game room')
        }
      }

      const newCommits: [boolean, boolean] = [...s.commits]
      newCommits[p] = true
      const newCommitHashes: [Uint8Array | null, Uint8Array | null] = s.commitHashes
        ? [...s.commitHashes]
        : [null, null]
      newCommitHashes[p] = m.hash
      const bothCommitted = newCommits[0] && newCommits[1]

      return {
        state: {
          ...s,
          room: s.room || m.room,
          commits: newCommits,
          commitHashes: newCommitHashes,
          phase: bothCommitted ? 'reveal' : 'commit',
        },
        outcome: 'continue',
      }
    } else if (m.type === 'reveal') {
      if (s.phase !== 'reveal') {
        throw new Error('Not reveal phase')
      }
      if (s.reveals[p]) {
        throw new Error(`Player ${p} already revealed`)
      }

      // Validate choice (0 = Rock, 1 = Paper, 2 = Scissors)
      if (!Number.isInteger(m.choice) || m.choice < 0 || m.choice > 2) {
        return {
          state: s,
          outcome: { win: (1 - p) as 0 | 1 },
        }
      }

      // Validate salt length (must be 32 bytes, else forfeit)
      if (!m.salt || m.salt.length !== 32) {
        return {
          state: s,
          outcome: { win: (1 - p) as 0 | 1 },
        }
      }

      // Verify commit hash (fail closed if missing)
      if (!s.commitHashes || !s.commitHashes[p]) {
        return {
          state: s,
          outcome: { win: (1 - p) as 0 | 1 },
        }
      }
      const expected = s.commitHashes[p]!
      const actual = computeRpsHash(s.room || new Uint8Array(32), p, m.choice, m.salt)
      let match = true
      for (let i = 0; i < 32; i++) {
        if (expected[i] !== actual[i]) {
          match = false
          break
        }
      }
      if (!match) {
        return {
          state: s,
          outcome: { win: (1 - p) as 0 | 1 },
        }
      }

      const newReveals: [boolean, boolean] = [...s.reveals]
      newReveals[p] = true
      const newLastChoices: [RpsChoice | null, RpsChoice | null] = [...s.lastChoices]
      newLastChoices[p] = m.choice

      const bothRevealed = newReveals[0] && newReveals[1]
      if (!bothRevealed) {
        return {
          state: {
            ...s,
            reveals: newReveals,
            lastChoices: newLastChoices,
          },
          outcome: 'continue',
        }
      }

      // Both players have revealed: determine round outcome
      const c0 = newLastChoices[0]!
      const c1 = newLastChoices[1]!

      if (c0 === c1) {
        // Tie round
        const newDraws = s.drawCount + 1
        if (newDraws >= MAX_DRAWS) {
          const tiedEndState: RpsState = {
            ...s,
            drawCount: newDraws,
            reveals: newReveals,
            lastChoices: newLastChoices,
          }
          if (s.scores[0] > s.scores[1]) return { state: tiedEndState, outcome: { win: 0 } }
          if (s.scores[1] > s.scores[0]) return { state: tiedEndState, outcome: { win: 1 } }
          return { state: tiedEndState, outcome: 'draw' }
        }

        return {
          state: {
            ...s,
            round: s.round + 1,
            phase: 'commit',
            commits: [false, false],
            reveals: [false, false],
            lastChoices: newLastChoices,
            commitHashes: [null, null],
            drawCount: newDraws,
          },
          outcome: 'continue',
        }
      }

      if (rpsBeats(c0, c1)) {
        // Player 0 wins round
        const newScore0 = s.scores[0] + 1
        const newScores: [number, number] = [newScore0, s.scores[1]]

        if (newScore0 >= TARGET_WINS) {
          return {
            state: { ...s, scores: newScores, lastChoices: newLastChoices, reveals: newReveals },
            outcome: { win: 0 },
          }
        }

        const nextRound = s.round + 1
        if (nextRound >= MAX_TOTAL_ROUNDS) {
          if (newScore0 > s.scores[1]) return { state: s, outcome: { win: 0 } }
          if (s.scores[1] > newScore0) return { state: s, outcome: { win: 1 } }
          return { state: s, outcome: 'draw' }
        }

        return {
          state: {
            ...s,
            round: nextRound,
            phase: 'commit',
            commits: [false, false],
            reveals: [false, false],
            lastChoices: newLastChoices,
            commitHashes: [null, null],
            scores: newScores,
          },
          outcome: 'continue',
        }
      } else {
        // Player 1 wins round
        const newScore1 = s.scores[1] + 1
        const newScores: [number, number] = [s.scores[0], newScore1]

        if (newScore1 >= TARGET_WINS) {
          return {
            state: { ...s, scores: newScores, lastChoices: newLastChoices, reveals: newReveals },
            outcome: { win: 1 },
          }
        }

        const nextRound = s.round + 1
        if (nextRound >= MAX_TOTAL_ROUNDS) {
          if (newScore1 > s.scores[0]) return { state: s, outcome: { win: 1 } }
          if (s.scores[0] > newScore1) return { state: s, outcome: { win: 0 } }
          return { state: s, outcome: 'draw' }
        }

        return {
          state: {
            ...s,
            round: nextRound,
            phase: 'commit',
            commits: [false, false],
            reveals: [false, false],
            lastChoices: newLastChoices,
            commitHashes: [null, null],
            scores: newScores,
          },
          outcome: 'continue',
        }
      }
    } else {
      throw new Error(`Unknown move type`)
    }
  },

  encodeAction(m: RpsMove): Uint8Array {
    if (m.type === 'commit') {
      const buf = new Uint8Array(65)
      buf[0] = 0 // ACTION_TAG_COMMIT
      buf.set(m.room, 1)
      buf.set(m.hash, 33)
      return buf
    } else {
      const buf = new Uint8Array(34)
      buf[0] = 1 // ACTION_TAG_REVEAL
      buf[1] = m.choice
      buf.set(m.salt, 2)
      return buf
    }
  },

  decodeState(buf: Uint8Array): RpsState {
    if (buf.length < 107) {
      throw new Error(`Buffer too short for RPS state: expected at least 107 bytes, got ${buf.length}`)
    }
    const room = buf.slice(0, 32)
    const round = buf[32]
    const phase: 'commit' | 'reveal' = buf[33] === 1 ? 'reveal' : 'commit'
    const commit0 = buf[34] === 1
    const commit1 = buf[35] === 1
    const reveal0 = buf[100] === 1
    const reveal1 = buf[101] === 1
    const choice0: RpsChoice | null = buf[102] <= 2 ? (buf[102] as RpsChoice) : null
    const choice1: RpsChoice | null = buf[103] <= 2 ? (buf[103] as RpsChoice) : null
    const score0 = buf[104]
    const score1 = buf[105]
    const drawCount = buf[106]

    const commitHash0 = commit0 ? buf.slice(36, 68) : null
    const commitHash1 = commit1 ? buf.slice(68, 100) : null

    return {
      round,
      phase,
      scores: [score0, score1],
      drawCount,
      commits: [commit0, commit1],
      reveals: [reveal0, reveal1],
      lastChoices: [choice0, choice1],
      commitHashes: [commitHash0, commitHash1],
      room,
    }
  },

  bot(level: 'easy' | 'medium' | 'hard') {
    return (s: RpsState, p: 0 | 1) => getBotRpsMove(level, s, p)
  },
}

export const rpsUI: GameUI<RpsState, RpsMove> = {
  Board(props) {
    return React.createElement(RpsBoard, props)
  },
}
