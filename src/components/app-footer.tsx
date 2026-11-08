import React from 'react'
import Link from 'next/link'
import { Terminal, ExternalLink, ShieldAlert, Cpu } from 'lucide-react'

/**
 * High-tech hacker terminal footer with protocol telemetry and direct diagnostic links.
 */
export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-emerald-500/20 bg-[#05090f]/95 text-slate-400 font-mono text-xs">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Terminal Protocol Telemetry */}
        <div className="flex flex-col items-center md:items-start gap-1 text-center md:text-left">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>SOLDUEL_KERNEL // DEVNET_RELEASE</span>
            <span className="text-[10px] text-cyan-400 border border-cyan-500/30 bg-cyan-950/40 px-1.5 py-0.5 rounded font-normal">
              0xPDA_ESCROW
            </span>
          </div>
          <p className="text-slate-400 text-[11px] max-w-md">
            Decentralized 1v1 minigames escrowed by on-chain PDAs. Non-custodial deterministic settlement on Solana.
          </p>
        </div>

        {/* Hacker Quick Links */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono">
          <Link
            href="/play/connect-four"
            className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <span>[ PRACTICE_BOTS.sh ]</span>
          </Link>

          <Link
            href="/leaderboard"
            className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <span>[ LEADERBOARD.dat ]</span>
          </Link>

          <a
            href="https://faucet.solana.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <span>[ FAUCET.fwd ↗ ]</span>
          </a>

          <a
            href="https://explorer.solana.com/?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <span>[ EXPLORER ↗ ]</span>
          </a>

          <a
            href="https://github.com/nilanjanchavan/SolDuel"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span>[ GITHUB ↗ ]</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
