'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { WordChainMove, WordChainState } from './types'
import { MAX_STRIKES, WORD_CHAIN_TIMEOUT_SECS } from './constants'
import { getRequiredPrefix } from './bot'

export interface WordChainBoardProps {
  state: WordChainState
  me: 0 | 1
  onMove: (m: WordChainMove) => void
  disabled: boolean
}

export const WordChainBoard: React.FC<WordChainBoardProps> = ({ state, me, onMove, disabled }) => {
  const [inputWord, setInputWord] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLookingUpProof, setIsLookingUpProof] = useState(false)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const abortControllerRef = useRef<AbortController | null>(null)

  const isMyTurn = state.currentTurn === me && !disabled
  const reqPrefix = useMemo(() => getRequiredPrefix(state.lastWord), [state.lastWord])

  // Active 1-second interval to update remaining time
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTs(Date.now())
    }, 500)
    return () => clearInterval(timer)
  }, [])

  // Cleanup pending fetch on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const turnStart = state.turnStartTs > 0 ? state.turnStartTs : nowTs
  const elapsedSecs = Math.max(0, Math.floor((nowTs - turnStart) / 1000))
  const remainingSecs = Math.max(0, WORD_CHAIN_TIMEOUT_SECS - elapsedSecs)
  const timerRatio = Math.max(0, Math.min(1, remainingSecs / WORD_CHAIN_TIMEOUT_SECS))

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      if (!isMyTurn || isLookingUpProof) return

      const cleaned = inputWord.trim().toLowerCase()
      if (!cleaned) return

      if (cleaned.length < 3) {
        setErrorMsg('Word must be at least 3 letters long.')
        return
      }

      if (!/^[a-z]+$/.test(cleaned)) {
        setErrorMsg('Word must contain only lowercase letters (a-z).')
        return
      }

      if (reqPrefix && !cleaned.startsWith(reqPrefix)) {
        setErrorMsg(`Word must start with "${reqPrefix.toUpperCase()}".`)
        return
      }

      setErrorMsg(null)
      setIsLookingUpProof(true)

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      let proof: string[] | undefined = undefined
      try {
        const prefix = cleaned.slice(0, 2)
        let res = await fetch(`/dictionary/shards/${prefix}.json`, { signal: controller.signal })
        if (!res.ok) {
          res = await fetch('/dictionary/shards/_rare.json', { signal: controller.signal })
        }
        if (res.ok) {
          const shard = await res.json()
          if (Array.isArray(shard[cleaned])) {
            proof = shard[cleaned]
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        // Fallback for offline/unit test environments
      } finally {
        if (!controller.signal.aborted) {
          setIsLookingUpProof(false)
        }
      }

      // Re-verify that it is still this player's turn and component is active
      if (controller.signal.aborted || state.currentTurn !== me || disabled) {
        return
      }

      setInputWord('')
      if (proof) {
        onMove({ word: cleaned, proof })
      } else {
        onMove(cleaned)
      }
    },
    [inputWord, isMyTurn, isLookingUpProof, reqPrefix, onMove, state.currentTurn, me, disabled],
  )

  return (
    <div className="w-full max-w-xl mx-auto p-4 md:p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-white space-y-6">
      {/* Header with Turn Indicator & Timer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Word Chain</span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                isMyTurn
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {isMyTurn ? 'Your Turn' : 'Opponent Turn'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Form words starting with the previous word&apos;s ending letters
          </p>
        </div>

        {/* 30s Countdown Timer */}
        <div
          role="timer"
          aria-label={`Time remaining: ${remainingSecs} seconds`}
          aria-live="polite"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
            remainingSecs <= 5 && isMyTurn
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 motion-safe:animate-pulse'
              : 'bg-slate-800/80 border-slate-700/80 text-slate-200'
          }`}
        >
          <div className="w-5 h-5 relative flex items-center justify-center">
            <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-slate-700"
                fill="none"
              />
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2.5"
                className={remainingSecs <= 5 ? 'text-rose-400 transition-all' : 'text-amber-400 transition-all'}
                fill="none"
                strokeDasharray={2 * Math.PI * 10}
                strokeDashoffset={2 * Math.PI * 10 * (1 - timerRatio)}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums">{remainingSecs}s</span>
        </div>
      </div>

      {/* Strikes Status Tracker for Both Players */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800/60">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400 font-medium">
            <span>You {me === 0 ? '(P1)' : '(P2)'}</span>
            <span className="text-rose-400 font-bold">
              {state.strikes[me]} / {MAX_STRIKES} Strikes
            </span>
          </div>
          <div className="flex gap-1.5" aria-label={`Your strikes: ${state.strikes[me]}`}>
            {Array.from({ length: MAX_STRIKES }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  i < state.strikes[me] ? 'bg-rose-500 shadow-sm shadow-rose-500/50' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400 font-medium">
            <span>Opponent {1 - me === 0 ? '(P1)' : '(P2)'}</span>
            <span className="text-rose-400 font-bold">
              {state.strikes[1 - me]} / {MAX_STRIKES} Strikes
            </span>
          </div>
          <div className="flex gap-1.5" aria-label={`Opponent strikes: ${state.strikes[1 - me]}`}>
            {Array.from({ length: MAX_STRIKES }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  i < state.strikes[1 - me] ? 'bg-rose-500 shadow-sm shadow-rose-500/50' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Chain Status: Last Word & Required Prefix */}
      <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/60 text-center space-y-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Chain History ({state.wordsCount} words played)
        </span>
        {state.lastWord ? (
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-amber-300 font-mono tracking-wider">
              {state.lastWord.toUpperCase()}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700">
              <span>Next word must start with:</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">
                &ldquo;{reqPrefix.toUpperCase()}&rdquo;
              </span>
              <span className="text-slate-400 text-[10px]">
                ({reqPrefix.length === 2 ? '2-letter rule' : '1-letter rule'})
              </span>
            </div>
          </div>
        ) : (
          <div className="py-2 text-slate-400 text-sm">
            <span className="font-semibold text-emerald-400">Opening Move:</span> Play any valid word to begin the
            chain!
          </div>
        )}
      </div>

      {/* Interactive Word Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputWord}
            onChange={(e) => {
              setInputWord(e.target.value.toLowerCase())
              if (errorMsg) setErrorMsg(null)
            }}
            placeholder={reqPrefix ? `Type a word starting with "${reqPrefix}"...` : 'Type your opening word...'}
            disabled={!isMyTurn || isLookingUpProof}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
          />
          <button
            type="submit"
            disabled={!isMyTurn || !inputWord.trim() || isLookingUpProof}
            className="px-5 py-2.5 rounded-xl font-semibold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-md shadow-amber-500/20 flex items-center justify-center min-w-[100px]"
          >
            {isLookingUpProof ? (
              <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full motion-safe:animate-spin" />
            ) : (
              'Play Word'
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="text-rose-400 text-xs font-medium px-2 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}
      </form>
    </div>
  )
}
