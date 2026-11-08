import React from 'react'
import Link from 'next/link'
import { Swords, ExternalLink, ShieldCheck, Droplet, Trophy } from 'lucide-react'

/**
 * Bespoke gaming footer with protocol information and quick utility links.
 */
export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md text-slate-400 text-xs">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand & Protocol Tag */}
        <div className="flex flex-col items-center md:items-start gap-1.5 text-center md:text-left">
          <div className="flex items-center gap-2 text-slate-200 font-bold tracking-tight text-sm">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 text-xs shadow-sm shadow-amber-500/20">
              ⚔️
            </div>
            <span>SolDuel Protocol</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Devnet Live
            </span>
          </div>
          <p className="text-slate-400 text-xs max-w-sm">
            Staked 1v1 on-chain minigames powered by Anchor PDA escrow escrow. Provably fair, non-custodial gaming.
          </p>
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium">
          <Link
            href="/play/connect-four"
            className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Practice Sandbox</span>
          </Link>

          <Link
            href="/leaderboard"
            className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors"
          >
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span>Leaderboard</span>
          </Link>

          <a
            href="https://faucet.solana.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors"
          >
            <Droplet className="h-3.5 w-3.5 text-blue-400" />
            <span>Solana Faucet</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>

          <a
            href="https://explorer.solana.com/?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors"
          >
            <span>Explorer</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>

          <a
            href="https://github.com/nilanjanchavan/SolDuel"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>
      </div>
    </footer>
  )
}
