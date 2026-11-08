'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Terminal, ExternalLink, Check } from 'lucide-react'

export interface GameRuleSpec {
  id: number
  name: string
  slug: string
  icon: string
  tag: string
  clock: string
  resolution: string
  lines: string[]
}

export const GAME_SPECS: Record<number, GameRuleSpec> = {
  0: {
    id: 0,
    name: 'Connect Four',
    slug: 'connect-four',
    icon: '🔴',
    tag: 'Skill Game',
    clock: '60s / turn',
    resolution: '4-in-a-row',
    lines: [
      '7x6 gravity grid: players alternate dropping discs into columns',
      'First to align 4 tokens (horizontal, vertical, or diagonal) wins',
      '60s turn deadline: stalling grants opponent instant victory claim',
      'Escrow payout released automatically on-chain upon resolution',
    ],
  },
  1: {
    id: 1,
    name: 'Word Chain',
    slug: 'word-chain',
    icon: '🔤',
    tag: 'Skill Game',
    clock: '30s / turn',
    resolution: 'Merkle Root',
    lines: [
      "Word must start with previous word's last 2 letters (min 3 letters)",
      'All words verified against on-chain dictionary Merkle root',
      'Rule-breaking, invalid, or repeated words give strikes',
      '4 strikes forfeits match; timer runs continuously after strike',
    ],
  },
  2: {
    id: 2,
    name: 'Rock Paper Scissors',
    slug: 'rps',
    icon: '✂️',
    tag: 'Provably Fair Luck',
    clock: '60s / turn',
    resolution: 'SHA-256 Commit',
    lines: [
      'Best-of-3 duel secured by dual SHA-256 cryptographic commit-reveal',
      'Phase 1: Both duelists seal hidden hash of (choice + secret salt)',
      'Phase 2: Both reveal choice and salt; mismatch forfeits stake',
      'Standard rules: Rock > Scissors > Paper > Rock. First to 2 wins.',
    ],
  },
  3: {
    id: 3,
    name: 'Dice Duel',
    slug: 'dice',
    icon: '🎲',
    tag: 'Provably Fair Luck',
    clock: '60s / turn',
    resolution: 'Joint Entropy',
    lines: [
      'Both duelists commit secret random seeds to the MatchRoom PDA',
      'On reveal, contract derives joint roll: (SHA256(seedA ⊕ seedB) % 6) + 1',
      'Highest 6-sided dice roll wins pot; tied roll triggers free replay',
      'Neither player can predict or manipulate the outcome unilaterally',
    ],
  },
}

/**
 * Sleek floating rules HUD with high-tech typewriter animation on hover.
 */
export function CyberRulesTerminal({
  gameId,
  isHovered = false,
}: {
  gameId: number
  isHovered?: boolean
}) {
  const spec = GAME_SPECS[gameId] || GAME_SPECS[0]

  const [streamedIndex, setStreamedIndex] = useState(0)
  const [streamedChar, setStreamedChar] = useState(0)
  const [isDone, setIsDone] = useState(false)

  // Stream in lines character-by-character on game change
  useEffect(() => {
    setStreamedIndex(0)
    setStreamedChar(0)
    setIsDone(false)

    let line = 0
    let char = 0
    const lines = spec.lines

    const interval = setInterval(() => {
      if (line >= lines.length) {
        setIsDone(true)
        clearInterval(interval)
        return
      }

      if (char < lines[line].length) {
        char += 4 // Fast snappy typing
        setStreamedChar(Math.min(char, lines[line].length))
      } else {
        line++
        char = 0
        setStreamedIndex(line)
        setStreamedChar(0)
      }
    }, 12)

    return () => clearInterval(interval)
  }, [gameId, spec])

  return (
    <div className="rounded-xl hacker-panel border border-emerald-500/30 p-4 font-mono text-xs flex flex-col justify-between h-full min-h-[220px]">
      <div>
        {/* Sleek Top Header */}
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <span>{spec.icon}</span>
              <span>{spec.name.toUpperCase()}</span>
              <span className="text-slate-600">//</span>
              <span className="text-slate-400 font-normal">RULES</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isHovered ? (
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold">
                HOVER
              </span>
            ) : isDone ? (
              <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-bold">
                <Check className="h-2.5 w-2.5" />
                <span>LOADED</span>
              </span>
            ) : (
              <span className="text-[9px] text-amber-400 animate-pulse font-bold">
                STREAMING...
              </span>
            )}
          </div>
        </div>

        {/* Animated Typewriter Code Lines */}
        <div className="space-y-2 text-[11px] leading-relaxed text-slate-300">
          {spec.lines.map((rawLine, idx) => {
            if (idx > streamedIndex) return null

            const isCurrentLine = idx === streamedIndex
            const textToRender = isCurrentLine ? rawLine.slice(0, streamedChar) : rawLine

            return (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-emerald-400 shrink-0 select-none font-bold">&gt;</span>
                <span className={idx === 0 ? 'text-slate-200' : 'text-slate-400'}>
                  {textToRender}
                  {isCurrentLine && (
                    <span className="inline-block w-1.5 h-3 bg-emerald-400 align-middle ml-1 animate-pulse" />
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Clean Bottom Bar */}
      <div className="mt-4 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="text-cyan-400 font-semibold">{spec.clock}</span>
          <span>•</span>
          <span className="text-slate-400">{spec.resolution}</span>
        </div>

        <Link
          href={`/play/${spec.slug}`}
          className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
        >
          <span>Practice Bot</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
