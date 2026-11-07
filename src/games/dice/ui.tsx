'use client'

import React, { useState } from 'react'
import { DiceMove, DiceState } from './types'
import { computeDiceHash } from './bot'

export interface DiceBoardProps {
  state: DiceState
  me: 0 | 1
  onMove(m: DiceMove): void
  disabled: boolean
}

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function generateSalt(): Uint8Array {
  const salt = new Uint8Array(32)
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(salt)
  } else {
    for (let i = 0; i < 32; i++) salt[i] = Math.floor(Math.random() * 256)
  }
  return salt
}

function getRandomRoll(): number {
  return Math.floor(Math.random() * 6) + 1
}

export function DiceBoard({ state, me, onMove, disabled }: DiceBoardProps) {
  const [selectedRoll, setSelectedRoll] = useState<number | null>(null)
  const [mySalt, setMySalt] = useState<Uint8Array | null>(null)
  const [prevRound, setPrevRound] = useState(state.round)

  if (state.round !== prevRound) {
    setPrevRound(state.round)
    setSelectedRoll(null)
    setMySalt(null)
  }

  const opponent = (1 - me) as 0 | 1
  const myCommitDone = state.commits[me]
  const oppCommitDone = state.commits[opponent]
  const myRevealDone = state.reveals[me]
  const oppRevealDone = state.reveals[opponent]

  const handleRollDice = (choice?: number) => {
    if (disabled || myCommitDone || state.phase !== 'commit') return
    const roll = choice || getRandomRoll()
    setSelectedRoll(roll)

    const salt = generateSalt()
    setMySalt(salt)

    const room = state.room || new Uint8Array(32)
    const hash = computeDiceHash(room, me, roll, salt)
    onMove({ type: 'commit', room, hash })
  }

  const handleReveal = () => {
    if (disabled || myRevealDone || state.phase !== 'reveal') return
    if (selectedRoll === null || !mySalt) {
      const fallbackSalt = new Uint8Array(32)
      onMove({ type: 'reveal', choice: 6, salt: fallbackSalt })
      return
    }
    onMove({ type: 'reveal', choice: selectedRoll, salt: mySalt })
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-slate-900 border border-slate-800 rounded-2xl max-w-xl mx-auto shadow-2xl text-slate-100">
      {/* Header */}
      <div className="w-full flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Dice Duel</span>
          <div className="text-xl font-bold text-amber-400 mt-1">Highest Roll Wins</div>
          <span className="text-xs text-slate-500">Ties replay up to 5 times</span>
        </div>

        <div className="text-right">
          <div className="text-sm font-semibold text-slate-300">Round {state.round + 1}</div>
          {state.drawCount > 0 && <div className="text-xs text-amber-500">Draws: {state.drawCount} / 5 max</div>}
        </div>
      </div>

      {/* Phase status */}
      <div className="w-full mb-6 py-2 px-4 rounded-lg bg-slate-800/60 border border-slate-700/60 text-center">
        {state.phase === 'commit' ? (
          <div>
            <div className="text-sm font-semibold text-amber-400">Step 1: Roll & Commit</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Roll your die secretly. Your roll is hashed and committed on-chain.
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold text-emerald-400">Step 2: Reveal Phase</div>
            <div className="text-xs text-slate-400 mt-0.5">Both players rolled! Reveal to see who scored higher.</div>
          </div>
        )}
      </div>

      {/* Player Statuses */}
      <div className="grid grid-cols-2 gap-4 w-full mb-6">
        <div
          className={`p-4 rounded-xl border text-center ${myCommitDone ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300' : 'border-slate-800 bg-slate-800/40 text-slate-400'}`}
        >
          <div className="text-xs">Your Status</div>
          <div className="font-semibold text-sm mt-1">
            {myRevealDone ? `✓ Revealed (${selectedRoll})` : myCommitDone ? '✓ Committed' : 'Waiting to roll...'}
          </div>
        </div>
        <div
          className={`p-4 rounded-xl border text-center ${oppCommitDone ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300' : 'border-slate-800 bg-slate-800/40 text-slate-400'}`}
        >
          <div className="text-xs">Opponent Status</div>
          <div className="font-semibold text-sm mt-1">
            {oppRevealDone ? '✓ Revealed' : oppCommitDone ? '✓ Committed' : 'Rolling...'}
          </div>
        </div>
      </div>

      {/* Action Area */}
      {state.phase === 'commit' && (
        <div className="w-full text-center">
          <button
            type="button"
            disabled={disabled || myCommitDone}
            onClick={() => handleRollDice()}
            className="w-full py-5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xl shadow-lg shadow-orange-900/30 transition-all cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🎲 Roll Your Die
          </button>

          <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-slate-500">
            <span>Or choose manually:</span>
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <button
                key={num}
                type="button"
                disabled={disabled || myCommitDone}
                onClick={() => handleRollDice(num)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {DIE_FACES[num]} {num}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reveal Action Area */}
      {state.phase === 'reveal' && (
        <div className="w-full text-center">
          {myRevealDone ? (
            <div className="py-4 text-emerald-400 font-medium text-sm animate-pulse">
              You revealed {selectedRoll ? `${DIE_FACES[selectedRoll]} (${selectedRoll})` : ''}! Awaiting opponent...
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={handleReveal}
              className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-lg shadow-lg shadow-emerald-900/30 transition-all cursor-pointer active:scale-98"
            >
              Reveal Your Die {selectedRoll ? `${DIE_FACES[selectedRoll]} (${selectedRoll})` : ''}
            </button>
          )}
        </div>
      )}

      {/* Last revealed dice results */}
      {state.rolls[0] > 0 && state.rolls[1] > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-800 w-full flex justify-around items-center text-center">
          <div>
            <span className="text-xs text-slate-400">Player 0 Roll</span>
            <div className="text-4xl mt-1">{DIE_FACES[state.rolls[0]]}</div>
            <span className="text-sm font-bold text-slate-300">{state.rolls[0]}</span>
          </div>
          <div className="text-2xl font-black text-slate-600">VS</div>
          <div>
            <span className="text-xs text-slate-400">Player 1 Roll</span>
            <div className="text-4xl mt-1">{DIE_FACES[state.rolls[1]]}</div>
            <span className="text-sm font-bold text-slate-300">{state.rolls[1]}</span>
          </div>
        </div>
      )}
    </div>
  )
}
