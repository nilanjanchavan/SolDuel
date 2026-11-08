'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter, notFound } from 'next/navigation'
import Link from 'next/link'
import { GameKind, Outcome, RegisteredGame } from '@/games/types'
import { GAME_REGISTRY } from '@/games'

type Difficulty = 'easy' | 'medium' | 'hard'

interface GameMeta {
  name: string
  slug: string
  icon: string
  description: string
}

const GAME_META: Partial<Record<GameKind, GameMeta>> = {
  [GameKind.Rps]: {
    name: 'Rock Paper Scissors',
    slug: 'rps',
    icon: '✂️',
    description: 'Commit-reveal best of 3 duel with tie replay cap',
  },
  [GameKind.Dice]: {
    name: 'Dice Duel',
    slug: 'dice',
    icon: '🎲',
    description: 'Commit-reveal 6-sided dice roll duel, high roll wins',
  },
}

function parseGameKind(slug: string | undefined): GameKind {
  if (!slug) return GameKind.Rps
  const s = slug.toLowerCase()
  switch (s) {
    case 'rps':
    case 'rock-paper-scissors':
      return GameKind.Rps
    case 'dice':
    case 'dice-duel':
      return GameKind.Dice
    default:
      notFound()
  }
}

interface PracticeMatchProps {
  gameRecord: RegisteredGame
  gameInfo: GameMeta
  difficulty: Difficulty
  onRematch(): void
}

function PracticeMatch({ gameRecord, gameInfo, difficulty, onRematch }: PracticeMatchProps) {
  const engine = gameRecord.engine
  const UIComponent = gameRecord.ui.Board

  const [gameState, setGameState] = useState<unknown>(() => engine.init(0))
  const [outcome, setOutcome] = useState<Outcome>('continue')
  const [botError, setBotError] = useState<string | null>(null)
  const [botRetryCount, setBotRetryCount] = useState(0)

  // Check if it is currently the bot's turn to act
  const isBotThinking = useMemo(() => {
    if (outcome !== 'continue' || botError || !gameState || typeof gameState !== 'object') return false
    const s = gameState as Record<string, unknown>
    if ('phase' in s && 'commits' in s) {
      const commits = s.commits as [boolean, boolean]
      const reveals = s.reveals as [boolean, boolean]
      if (s.phase === 'commit' && !commits[1]) return true
      if (s.phase === 'reveal' && !reveals[1]) return true
      return false
    }
    if ('currentTurn' in s) {
      return s.currentTurn === 1
    }
    return false
  }, [outcome, botError, gameState])

  // Handle human move
  const handleHumanMove = useCallback(
    (move: unknown) => {
      if (outcome !== 'continue' || isBotThinking || botError) return
      try {
        const res = engine.apply(gameState as never, 0, move as never)
        setGameState(res.state)
        setOutcome(res.outcome)
        setBotError(null)
      } catch (err) {
        console.error('Failed to apply human move:', err)
      }
    },
    [engine, gameState, outcome, isBotThinking, botError],
  )

  // Autonomous bot response timer
  useEffect(() => {
    if (!isBotThinking) return

    const timer = setTimeout(() => {
      try {
        const botFn = engine.bot(difficulty)
        const botMove = botFn(gameState as never, 1)
        const res = engine.apply(gameState as never, 1, botMove as never)
        setGameState(res.state)
        setOutcome(res.outcome)
        setBotError(null)
      } catch (err) {
        console.error('Failed to apply bot move:', err)
        setBotError('The bot encountered an error calculating its move. You can retry or reset the match.')
      }
    }, 550)

    return () => clearTimeout(timer)
  }, [isBotThinking, engine, difficulty, gameState, botRetryCount])

  const handleRetryBot = () => {
    setBotError(null)
    setBotRetryCount((c) => c + 1)
  }

  return (
    <div className="space-y-6">
      {/* Outcome Banner */}
      {outcome !== 'continue' && (
        <div
          className={`p-6 rounded-2xl text-center border shadow-xl transition-all ${
            outcome === 'draw'
              ? 'bg-slate-800/80 border-slate-600 text-slate-200'
              : outcome.win === 0
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
                : 'bg-rose-950/40 border-rose-500/50 text-rose-200 shadow-rose-950/50'
          }`}
        >
          <div className="text-3xl mb-2">{outcome === 'draw' ? '🤝' : outcome.win === 0 ? '🏆' : '💀'}</div>
          <h3 className="text-xl font-bold tracking-tight">
            {outcome === 'draw'
              ? 'Match Ended in a Draw!'
              : outcome.win === 0
                ? `Victory! You defeated the ${difficulty} bot!`
                : `Defeat! The ${difficulty} bot won the duel.`}
          </h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Practice matches never impact your wallet or leaderboards.</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={onRematch}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 transition-all cursor-pointer shadow-md shadow-emerald-500/20"
            >
              Play Again
            </button>
            <Link
              href={`/?game=${gameInfo.slug}`}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white border border-slate-700 transition-all"
            >
              Play for Real ⚔️
            </Link>
          </div>
        </div>
      )}

      {/* Bot Error Recovery Banner */}
      {botError && (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-center space-y-2">
          <p className="text-sm font-semibold">{botError}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={handleRetryBot}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-slate-950 cursor-pointer"
            >
              Retry Bot
            </button>
            <button
              type="button"
              onClick={onRematch}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 cursor-pointer"
            >
              Reset Match
            </button>
          </div>
        </div>
      )}

      {/* Board Canvas */}
      <div className="relative">
        {isBotThinking && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/80 border border-amber-500/40 text-amber-300 text-xs font-semibold backdrop-blur-sm motion-safe:animate-pulse shadow-md">
            <span className="w-2 h-2 rounded-full bg-amber-400 motion-safe:animate-ping" />
            <span>Bot is thinking...</span>
          </div>
        )}

        <UIComponent
          state={gameState as never}
          me={0}
          onMove={handleHumanMove}
          disabled={outcome !== 'continue' || isBotThinking}
        />
      </div>
    </div>
  )
}

export default function PracticeGamePage() {
  const params = useParams()
  const router = useRouter()
  const gameSlug = Array.isArray(params?.game) ? params.game[0] : params?.game

  const selectedKind = useMemo(() => parseGameKind(gameSlug), [gameSlug])
  const gameInfo = GAME_META[selectedKind] || GAME_META[GameKind.Rps]!
  const gameRecord = GAME_REGISTRY[selectedKind]

  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [matchId, setMatchId] = useState(0)

  const handleRematch = useCallback(() => {
    setMatchId((prev) => prev + 1)
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Practice Mode Header Banner */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-teal-950/30 border border-emerald-500/30 shadow-lg shadow-emerald-950/20">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xl">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Practice, no stakes
              </span>
              <span className="text-xs text-slate-400">Off-chain bot sandbox</span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Play freely with zero wallet connection. Profiles, ratings, and coin balances are never touched.
            </p>
          </div>
        </div>

        <Link
          href={`/?game=${gameInfo.slug}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <span>Play for real</span>
          <span className="text-base">⚔️</span>
        </Link>
      </div>

      {/* Game Selector & Difficulty Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
        {/* Game Switcher Tabs */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(GAME_META).map(([kindKey, meta]) => {
            if (!meta) return null
            const kindNum = Number(kindKey) as GameKind
            const isCurrent = kindNum === selectedKind
            return (
              <button
                key={meta.slug}
                type="button"
                onClick={() => router.push(`/play/${meta.slug}`)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/10'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60 hover:bg-slate-700/60'
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.name}</span>
              </button>
            )
          })}
        </div>

        {/* Difficulty Controls */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => {
            const isActive = difficulty === level
            return (
              <button
                key={level}
                type="button"
                onClick={() => {
                  setDifficulty(level)
                  handleRematch()
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {level}
              </button>
            )
          })}
        </div>
      </div>

      {/* Render Practice Match keyed by game, difficulty and matchId */}
      <PracticeMatch
        key={`${gameInfo.slug}-${difficulty}-${matchId}`}
        gameRecord={gameRecord}
        gameInfo={gameInfo}
        difficulty={difficulty}
        onRematch={handleRematch}
      />

      {/* Action Footer */}
      <div className="flex justify-between items-center text-xs text-slate-500 pt-4 border-t border-slate-800/80">
        <div>
          Current Bot: <span className="font-semibold text-slate-400 capitalize">{difficulty}</span> (Level{' '}
          {difficulty === 'easy' ? '1' : difficulty === 'medium' ? '2' : '3'})
        </div>
        <button
          type="button"
          onClick={handleRematch}
          className="hover:text-slate-300 transition-colors underline cursor-pointer"
        >
          Reset Practice Board
        </button>
      </div>
    </div>
  )
}
