'use client'

import React, { useState } from 'react'
import { RpsChoice, RpsMove, RpsState } from './types'
import { computeRpsHash, recordHumanMove } from './bot'

export interface RpsBoardProps {
  state: RpsState
  me: 0 | 1
  onMove(m: RpsMove): void
  disabled: boolean
}

const CHOICES: { id: RpsChoice; label: string; icon: string }[] = [
  { id: 0, label: 'Rock', icon: '🪨' },
  { id: 1, label: 'Paper', icon: '📄' },
  { id: 2, label: 'Scissors', icon: '✂️' },
]

function generateSalt(): Uint8Array {
  const salt = new Uint8Array(32)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(salt)
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt)
  } else {
    throw new Error('Secure randomness unavailable for commit salt generation')
  }
  return salt
}

function getStorageKey(room: Uint8Array | null, round: number, me: number): string {
  const norm = room || new Uint8Array(32)
  const roomHex = Array.from(norm)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `solduel-rps-${roomHex}-${round}-${me}`
}

function saveSecret(room: Uint8Array | null, round: number, me: number, choice: RpsChoice, salt: Uint8Array) {
  if (typeof window === 'undefined') return
  try {
    const saltHex = Array.from(salt)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const val = JSON.stringify({ choice, saltHex })
    window.sessionStorage.setItem(getStorageKey(room, round, me), val)
    if (room) {
      window.sessionStorage.setItem(getStorageKey(null, round, me), val)
    }
  } catch {}
}

function loadSecret(
  room: Uint8Array | null,
  round: number,
  me: number,
): { choice: RpsChoice; salt: Uint8Array } | null {
  if (typeof window === 'undefined') return null
  try {
    let raw = window.sessionStorage.getItem(getStorageKey(room, round, me))
    if (!raw && room) {
      raw = window.sessionStorage.getItem(getStorageKey(null, round, me))
    }
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.choice !== 'number' || !Number.isInteger(parsed.choice) || parsed.choice < 0 || parsed.choice > 2) {
      return null
    }
    if (typeof parsed.saltHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(parsed.saltHex)) {
      return null
    }
    const salt = new Uint8Array(parsed.saltHex.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)))
    if (salt.length !== 32) return null
    return { choice: parsed.choice as RpsChoice, salt }
  } catch {
    return null
  }
}

function clearSecret(room: Uint8Array | null, round: number, me: number) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(getStorageKey(room, round, me))
    if (room) {
      window.sessionStorage.removeItem(getStorageKey(null, round, me))
    }
  } catch {}
}

/**
 * Rock Paper Scissors interactive board component for commit-reveal gameplay.
 */
export function RpsBoard({ state, me, onMove, disabled }: RpsBoardProps) {
  const [committing, setCommitting] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<RpsChoice | null>(() => {
    const restored = loadSecret(state.room, state.round, me)
    return restored ? restored.choice : null
  })
  const [mySalt, setMySalt] = useState<Uint8Array | null>(() => {
    const restored = loadSecret(state.room, state.round, me)
    return restored ? restored.salt : null
  })
  const [prevRound, setPrevRound] = useState(state.round)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (state.round !== prevRound) {
    clearSecret(state.room, prevRound, me)
    setPrevRound(state.round)
    const restored = loadSecret(state.room, state.round, me)
    setSelectedChoice(restored ? restored.choice : null)
    setMySalt(restored ? restored.salt : null)
    setErrorMessage(null)
  }

  const opponent = (1 - me) as 0 | 1
  const myCommitDone = state.commits[me]
  const oppCommitDone = state.commits[opponent]
  const myRevealDone = state.reveals[me]
  const oppRevealDone = state.reveals[opponent]

  const handleSelectChoice = (c: RpsChoice) => {
    if (disabled || myCommitDone || committing || state.phase !== 'commit') return
    setErrorMessage(null)
    setCommitting(true)
    try {
      const salt = selectedChoice === c && mySalt ? mySalt : generateSalt()
      setSelectedChoice(c)
      setMySalt(salt)
      saveSecret(state.room, state.round, me, c, salt)

      const room = state.room || new Uint8Array(32)
      const hash = computeRpsHash(room, me, c, salt)
      onMove({ type: 'commit', room, hash })
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to generate commit')
    } finally {
      setCommitting(false)
    }
  }

  const handleReveal = () => {
    if (disabled || myRevealDone || state.phase !== 'reveal') return
    let choice = selectedChoice
    let salt = mySalt

    if (choice === null || !salt) {
      const restored = loadSecret(state.room, state.round, me)
      if (restored) {
        choice = restored.choice
        salt = restored.salt
        setSelectedChoice(choice)
        setMySalt(salt)
      }
    }

    if (choice === null || !salt) {
      setErrorMessage('Secret choice and salt missing for reveal. Cannot reveal without matching secret.')
      return
    }

    setErrorMessage(null)
    recordHumanMove(choice)
    onMove({ type: 'reveal', choice, salt })
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-900 border border-slate-800 rounded-2xl max-w-xl mx-auto shadow-2xl text-slate-100">
      {/* Header & Scoreboard */}
      <div className="w-full flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div className="text-left">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Match Score</span>
          <div className="flex items-center space-x-3 mt-1">
            <span className={`text-xl font-bold ${me === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
              You: {state.scores[me]}
            </span>
            <span className="text-slate-600 font-bold">vs</span>
            <span className={`text-xl font-bold ${opponent === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
              Opponent: {state.scores[opponent]}
            </span>
          </div>
          <span className="text-xs text-slate-500">First to 2 wins (Best of 3)</span>
        </div>

        <div className="text-right">
          <div className="text-sm font-semibold text-slate-300">Round {state.round + 1}</div>
          {state.drawCount > 0 && <div className="text-xs text-amber-500">Draws: {state.drawCount} / 5 max</div>}
        </div>
      </div>

      {/* Phase Status Banner */}
      <div className="w-full mb-6 py-2 px-4 rounded-lg bg-slate-800/60 border border-slate-700/60 text-center">
        {state.phase === 'commit' ? (
          <div>
            <div className="text-sm font-semibold text-amber-400">Step 1: Commit Phase</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Choose your move secretly. Moves are cryptographically committed to the room.
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold text-emerald-400">Step 2: Reveal Phase</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Both players committed! Reveal your choice to resolve the round.
            </div>
          </div>
        )}
      </div>

      {/* Commit status trackers */}
      <div className="grid grid-cols-2 gap-4 w-full mb-6">
        <div
          className={`p-3 rounded-xl border text-center ${myCommitDone ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300' : 'border-slate-800 bg-slate-800/40 text-slate-400'}`}
        >
          <div className="text-xs">Your Status</div>
          <div className="font-semibold text-sm mt-1">
            {myRevealDone ? '✓ Revealed' : myCommitDone ? '✓ Committed' : 'Waiting for choice...'}
          </div>
        </div>
        <div
          className={`p-3 rounded-xl border text-center ${oppCommitDone ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300' : 'border-slate-800 bg-slate-800/40 text-slate-400'}`}
        >
          <div className="text-xs">Opponent Status</div>
          <div className="font-semibold text-sm mt-1">
            {oppRevealDone ? '✓ Revealed' : oppCommitDone ? '✓ Committed' : 'Thinking...'}
          </div>
        </div>
      </div>

      {/* Move Choice Buttons */}
      {state.phase === 'commit' && (
        <div className="w-full">
          <div className="text-center text-xs text-slate-400 mb-3 font-medium">Pick Rock, Paper, or Scissors</div>
          <div className="grid grid-cols-3 gap-3">
            {CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                disabled={disabled || myCommitDone}
                onClick={() => handleSelectChoice(choice.id)}
                className={`py-6 px-4 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  selectedChoice === choice.id
                    ? 'border-amber-400 bg-amber-500/10 scale-105 shadow-lg shadow-amber-500/10'
                    : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 hover:border-slate-600'
                } ${disabled || myCommitDone ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
              >
                <span className="text-4xl mb-2">{choice.icon}</span>
                <span className="text-sm font-semibold">{choice.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reveal Action Button */}
      {state.phase === 'reveal' && (
        <div className="w-full text-center">
          {myRevealDone ? (
            <div className="py-4 text-emerald-400 font-medium text-sm motion-safe:animate-pulse">
              You revealed {selectedChoice !== null ? CHOICES[selectedChoice].label : 'choice'}! Awaiting opponent...
            </div>
          ) : (
            <div>
              <button
                type="button"
                disabled={disabled}
                onClick={handleReveal}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-lg shadow-lg shadow-emerald-900/30 transition-all cursor-pointer active:scale-98"
              >
                Reveal{' '}
                {selectedChoice !== null
                  ? `${CHOICES[selectedChoice].icon} ${CHOICES[selectedChoice].label}`
                  : 'Your Move'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Visible Error Banner */}
      {errorMessage && (
        <div className="w-full mt-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
          {errorMessage}
        </div>
      )}

      {/* Last revealed round display */}
      {state.lastChoices[0] !== null && state.lastChoices[1] !== null && (
        <div className="mt-6 pt-4 border-t border-slate-800 w-full text-center text-xs text-slate-400">
          Last round: Player 0 chose {CHOICES[state.lastChoices[0]].label} ({CHOICES[state.lastChoices[0]].icon}) vs
          Player 1 chose {CHOICES[state.lastChoices[1]].label} ({CHOICES[state.lastChoices[1]].icon})
        </div>
      )}
    </div>
  )
}
