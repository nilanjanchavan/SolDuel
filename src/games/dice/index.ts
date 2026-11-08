import React from 'react'
import { sha256 } from 'js-sha256'
import { GameEngine, GameKind, GameUI, Outcome } from '../types'
import { DiceMove, DiceState } from './types'
import { getBotDiceMove, computeDiceHash } from './bot'
import { DiceBoard } from './ui'

export * from './types'
export * from './bot'
export * from './ui'

export const MAX_DRAWS = 5

/**
 * Deterministically derives a player's die roll (1..=6) from entropy contributed by both players.
 */
export function deriveDiceRoll(
  room: Uint8Array,
  salt0: Uint8Array,
  salt1: Uint8Array,
  choice0: number,
  choice1: number,
  player: 0 | 1
): number {
  const preimage = new Uint8Array(32 + 32 + 32 + 3)
  preimage.set(room, 0)
  preimage.set(salt0, 32)
  preimage.set(salt1, 64)
  preimage[96] = choice0
  preimage[97] = choice1
  preimage[98] = player
  const hashHex = sha256(preimage)
  const firstByte = parseInt(hashHex.slice(0, 2), 16)
  return (firstByte % 6) + 1
}

export const diceEngine: GameEngine<DiceState, DiceMove> = {
  kind: GameKind.Dice,
  isSkill: false,

  init(_firstPlayer: 0 | 1): DiceState {
    return {
      round: 0,
      phase: 'commit',
      rolls: [0, 0],
      drawCount: 0,
      commits: [false, false],
      reveals: [false, false],
      commitHashes: [null, null],
      room: null,
      choices: [255, 255],
      salts: [null, null],
    }
  },

  apply(s: DiceState, p: 0 | 1, m: DiceMove): { state: DiceState; outcome: Outcome } {
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

      // Validate choice is a 6-sided die roll (1..=6)
      if (!Number.isInteger(m.choice) || m.choice < 1 || m.choice > 6) {
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
      const actual = computeDiceHash(s.room || new Uint8Array(32), p, m.choice, m.salt)
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
      const newChoices: [number, number] = s.choices ? [...s.choices] : [255, 255]
      newChoices[p] = m.choice
      const newSalts: [Uint8Array | null, Uint8Array | null] = s.salts ? [...s.salts] : [null, null]
      newSalts[p] = m.salt

      const bothRevealed = newReveals[0] && newReveals[1]
      if (!bothRevealed) {
        return {
          state: {
            ...s,
            reveals: newReveals,
            choices: newChoices,
            salts: newSalts,
          },
          outcome: 'continue',
        }
      }

      // Both revealed: derive rolls from entropy of both players
      if (!newSalts[0] || !newSalts[1]) {
        throw new Error('Missing revealed salt for roll derivation')
      }
      const room = s.room || new Uint8Array(32)
      const salt0 = newSalts[0]
      const salt1 = newSalts[1]
      const c0 = newChoices[0]
      const c1 = newChoices[1]
      const r0 = deriveDiceRoll(room, salt0, salt1, c0, c1, 0)
      const r1 = deriveDiceRoll(room, salt0, salt1, c0, c1, 1)
      const newRolls: [number, number] = [r0, r1]

      if (r0 > r1) {
        return {
          state: { ...s, rolls: newRolls, reveals: newReveals, choices: newChoices, salts: newSalts },
          outcome: { win: 0 },
        }
      } else if (r1 > r0) {
        return {
          state: { ...s, rolls: newRolls, reveals: newReveals, choices: newChoices, salts: newSalts },
          outcome: { win: 1 },
        }
      } else {
        // Tied rolls: replay drawn round with a cap
        const newDraws = s.drawCount + 1
        if (newDraws >= MAX_DRAWS) {
          return {
            state: { ...s, rolls: newRolls, reveals: newReveals, choices: newChoices, salts: newSalts, drawCount: newDraws },
            outcome: 'draw',
          }
        }

        return {
          state: {
            ...s,
            round: s.round + 1,
            phase: 'commit',
            commits: [false, false],
            reveals: [false, false],
            commitHashes: [null, null],
            rolls: newRolls,
            choices: [255, 255],
            salts: [null, null],
            drawCount: newDraws,
          },
          outcome: 'continue',
        }
      }
    } else {
      throw new Error('Unknown move type')
    }
  },

  encodeAction(m: DiceMove): Uint8Array {
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

  decodeState(buf: Uint8Array): DiceState {
    if (buf.length < 172) {
      throw new Error(`Buffer too short for Dice state: expected at least 172 bytes, got ${buf.length}`)
    }
    const room = buf.slice(0, 32)
    const round = buf[32]
    const phase: 'commit' | 'reveal' = buf[33] === 1 ? 'reveal' : 'commit'
    const commit0 = buf[34] === 1
    const commit1 = buf[35] === 1
    const commitHash0 = commit0 ? buf.slice(36, 68) : null
    const commitHash1 = commit1 ? buf.slice(68, 100) : null
    const reveal0 = buf[100] === 1
    const reveal1 = buf[101] === 1
    const choice0 = buf[102]
    const choice1 = buf[103]
    const roll0 = buf[104]
    const roll1 = buf[105]
    const drawCount = buf[106]
    const salt0 = reveal0 ? buf.slice(107, 139) : null
    const salt1 = reveal1 ? buf.slice(139, 171) : null

    return {
      round,
      phase,
      rolls: [roll0, roll1],
      drawCount,
      commits: [commit0, commit1],
      reveals: [reveal0, reveal1],
      commitHashes: [commitHash0, commitHash1],
      room,
      choices: [choice0, choice1],
      salts: [salt0, salt1],
    }
  },

  bot(level: 'easy' | 'medium' | 'hard') {
    return (s: DiceState, p: 0 | 1) => getBotDiceMove(level, s, p)
  },
}

export const diceUI: GameUI<DiceState, DiceMove> = {
  Board(props) {
    return React.createElement(DiceBoard, props)
  },
}
