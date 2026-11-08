'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Terminal, Shield, Zap, Cpu, Sparkles, ExternalLink, CheckCircle2 } from 'lucide-react'

export interface GameRuleSpec {
  id: number
  code: string
  name: string
  slug: string
  icon: string
  skill: boolean
  lines: string[]
  hash: string
  specs: {
    turnClock: string
    resolution: string
    ratingMode: string
  }
}

export const GAME_SPECS: Record<number, GameRuleSpec> = {
  0: {
    id: 0,
    code: 'C4_MATRIX.bin',
    name: 'Connect Four',
    slug: 'connect-four',
    icon: '🔴',
    skill: true,
    hash: '0x8F9A4E21..C4_OK',
    specs: {
      turnClock: '60 SECONDS',
      resolution: '4-IN-A-ROW VECTOR',
      ratingMode: 'SKILL // ELO GAIN',
    },
    lines: [
      'LOAD_MODULE: c4_gravity_engine_v1.0',
      'GRID_SPECS: 7 COLUMNS x 6 ROWS [GRAVITY_LOCK]',
      'RULE_01: Alternate turns dropping disc in valid column',
      'RULE_02: First to connect 4 in row (H/V/D) wins pot',
      'RULE_03: Full grid without 4-in-a-row results in DRAW',
      'CLOCK: 60s per turn // Timeout yields instant victory',
      'ESCROW: Direct Anchor PDA payout upon match settlement',
    ],
  },
  1: {
    id: 1,
    code: 'WORD_CHAIN.sh',
    name: 'Word Chain',
    slug: 'word-chain',
    icon: '🔤',
    skill: true,
    hash: '0x3D7C19FA..WC_OK',
    specs: {
      turnClock: '30 SECONDS',
      resolution: 'MERKLE TREE ROOT',
      ratingMode: 'SKILL // WORD MASTER 👑',
    },
    lines: [
      'LOAD_MODULE: merkle_dictionary_verifier.sh',
      'RULE_01: Word must start with previous word\'s last 2 letters',
      'RULE_02: Min 3 letters // All words verified on Merkle root',
      'RULE_03: No repeated words allowed within the same match',
      'PENALTY: Invalid word or repeat = +1 strike',
      'DEFEAT: 4 strikes forfeits the entire match pot',
      'CLOCK: 30s per move // Clock continues running after strike',
    ],
  },
  2: {
    id: 2,
    code: 'RPS_SHA256.hex',
    name: 'Rock Paper Scissors',
    slug: 'rps',
    icon: '✂️',
    skill: false,
    hash: '0xE108BC44..RPS_OK',
    specs: {
      turnClock: '60 SECONDS',
      resolution: 'SHA-256 COMMIT/REVEAL',
      ratingMode: 'CASUAL // LUCK DUEL',
    },
    lines: [
      'LOAD_MODULE: sha256_commit_reveal_core.hex',
      'PHASE_01: Both duelists submit SHA256(room + choice + salt)',
      'PHASE_02: Both duelists reveal choice + 32-byte secret salt',
      'RULE_01: Rock > Scissors, Scissors > Paper, Paper > Rock',
      'WIN_CON: First player to 2 round victories claims pot',
      'TIE_RULE: Tied round replays // Max 5 draws allowed',
      'SECURITY: Tampered or mismatching reveal forfeits pot',
    ],
  },
  3: {
    id: 3,
    code: 'DICE_ENTROPY.dat',
    name: 'Dice Duel',
    slug: 'dice',
    icon: '🎲',
    skill: false,
    hash: '0x55B291A0..DICE_OK',
    specs: {
      turnClock: '60 SECONDS',
      resolution: 'JOINT SEED HASH',
      ratingMode: 'CASUAL // HIGH ROLLER 👑',
    },
    lines: [
      'LOAD_MODULE: joint_entropy_dice_derivation.dat',
      'COMMIT_PHASE: Both duelists seal secret random salt',
      'REVEAL_PHASE: Hashes opened on Solana devnet runtime',
      'ENTROPY: (SHA256(salt0 ^ salt1 ^ room)[0] % 6) + 1',
      'WIN_CON: Highest 6-sided dice roll wins entire pot',
      'TIE_RULE: Identical rolls trigger automatic round replay',
      'FAIRNESS: Neither duelist can bias outcome unilaterally',
    ],
  },
}

/**
 * High-tech hacker terminal HUD rendering streaming codeline rules with typewriter effect.
 * Floats beside the game cards and dynamically animates when games are hovered or selected.
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
        char += 3 // Type 3 chars per tick for snappy high-tech feel
        setStreamedChar(Math.min(char, lines[line].length))
      } else {
        line++
        char = 0
        setStreamedIndex(line)
        setStreamedChar(0)
      }
    }, 10)

    return () => clearInterval(interval)
  }, [gameId, spec])

  return (
    <div className="rounded-xl hacker-panel border border-emerald-500/40 p-4 sm:p-5 font-mono text-xs relative overflow-hidden flex flex-col justify-between h-full min-h-[340px] shadow-[0_0_25px_rgba(0,0,0,0.85)]">
      {/* Background CRT scanline texture */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-emerald-500/[0.02] to-transparent bg-[length:100%_4px]" />

      {/* Terminal Title Bar */}
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-500/20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            <span className="text-[11px] text-emerald-400 font-bold ml-1.5 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>RULES_INSPECTOR // {spec.code}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isHovered ? (
              <span className="text-[9px] uppercase px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 font-bold animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                HOVER_STREAMING
              </span>
            ) : isDone ? (
              <span className="text-[9px] uppercase px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                <span>LOADED</span>
              </span>
            ) : (
              <span className="text-[9px] uppercase px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40 font-bold animate-pulse">
                DECRYPTING...
              </span>
            )}
            <span className="hidden sm:inline-block text-[10px] text-slate-500 font-mono">{spec.hash}</span>
          </div>
        </div>

        {/* Active Module Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{spec.icon}</span>
            <span className="text-sm font-black text-white tracking-wider">{spec.name}</span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                spec.skill
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
            >
              {spec.skill ? 'SKILL_BASED' : 'PROVABLY_FAIR_LUCK'}
            </span>
          </div>

          <Link
            href={`/play/${spec.slug}`}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline"
          >
            <span>[ PRACTICE_BOT ↗ ]</span>
          </Link>
        </div>

        {/* Streaming Terminal Code Lines */}
        <div className="space-y-1 text-slate-300 font-mono text-[11px] leading-relaxed bg-[#03070d]/80 p-3 rounded-lg border border-slate-800/80">
          {spec.lines.map((rawLine, idx) => {
            if (idx > streamedIndex) return null

            const isCurrentLine = idx === streamedIndex
            const textToRender = isCurrentLine ? rawLine.slice(0, streamedChar) : rawLine

            const isRule = rawLine.startsWith('RULE')
            const isWinOrPenalty = rawLine.startsWith('WIN') || rawLine.startsWith('PENALTY') || rawLine.startsWith('DEFEAT')
            const isHeader = rawLine.startsWith('LOAD_MODULE') || rawLine.startsWith('GRID_SPECS') || rawLine.startsWith('PHASE')
            const isClockOrEscrow = rawLine.startsWith('CLOCK') || rawLine.startsWith('ESCROW') || rawLine.startsWith('SECURITY')

            return (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-slate-600 select-none text-[10px] shrink-0 w-5 text-right font-mono">
                  {(idx + 1).toString().padStart(2, '0')}
                </span>
                <span className="text-emerald-500/60 select-none shrink-0">&gt;</span>
                <span
                  className={`${
                    isHeader
                      ? 'text-cyan-400 font-bold'
                      : isWinOrPenalty
                        ? 'text-amber-300 font-semibold'
                        : isRule
                          ? 'text-emerald-300 font-medium'
                          : isClockOrEscrow
                            ? 'text-violet-300'
                            : 'text-slate-300'
                  }`}
                >
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

      {/* Hardware Telemetry Specs Footer */}
      <div className="mt-4 pt-3 border-t border-emerald-500/20 grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="bg-[#05090f] p-2 rounded border border-slate-800/80">
          <span className="text-slate-500 block text-[9px]">TURN_CLOCK</span>
          <span className="text-cyan-400 font-bold tracking-wider">{spec.specs.turnClock}</span>
        </div>
        <div className="bg-[#05090f] p-2 rounded border border-slate-800/80">
          <span className="text-slate-500 block text-[9px]">RESOLUTION</span>
          <span className="text-emerald-400 font-bold truncate tracking-wider">{spec.specs.resolution}</span>
        </div>
        <div className="bg-[#05090f] p-2 rounded border border-slate-800/80">
          <span className="text-slate-500 block text-[9px]">ARBITRATION</span>
          <span className="text-amber-400 font-bold truncate tracking-wider">{spec.specs.ratingMode}</span>
        </div>
      </div>
    </div>
  )
}
