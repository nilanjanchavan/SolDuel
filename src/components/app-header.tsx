'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { Button } from '@/components/ui/button'
import { Terminal, Menu, X, Shield, Cpu } from 'lucide-react'
import { ClusterUiSelect } from './cluster/cluster-ui'
import { WalletButton } from '@/components/solana/solana-provider'

/**
 * Main application navigation header styled with a cyber-terminal hacker aesthetic.
 */
export function AppHeader({ links = [] }: { links: { label: string; path: string }[] }) {
  const pathname = usePathname()
  const { publicKey } = useWallet()
  const [showMenu, setShowMenu] = useState(false)

  function isActive(path: string) {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-50 px-4 md:px-8 py-2.5 bg-[#05090f]/90 backdrop-blur-md border-b border-emerald-500/20 text-slate-300 font-mono">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Brand Terminal Header */}
        <div className="flex items-center gap-6">
          <Link className="flex items-center gap-2.5 group" href="/">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400 text-xs font-black shadow-[0_0_10px_rgba(16,185,129,0.3)] group-hover:border-emerald-400 transition-colors">
              &gt;_
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black tracking-widest text-white group-hover:text-emerald-400 transition-colors">
                SOL<span className="text-emerald-400">DUEL</span>
              </span>
              <span className="hidden sm:inline-block text-[9px] uppercase tracking-widest text-cyan-400 bg-cyan-950/50 border border-cyan-500/30 px-1.5 py-0.2 rounded font-bold">
                SYS::DEVNET
              </span>
            </div>
          </Link>

          {/* Terminal Command Navigation */}
          <nav className="hidden md:flex items-center">
            <ul className="flex items-center gap-2">
              {links.map(({ label, path }) => {
                const active = isActive(path)
                return (
                  <li key={path}>
                    <Link
                      className={`px-3 py-1 rounded text-xs font-semibold tracking-wider transition-all inline-flex items-center gap-1.5 ${
                        active
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                          : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-900/60 border border-transparent'
                      }`}
                      href={path}
                    >
                      <span className="text-emerald-500/60 text-[10px]">&gt;</span>
                      <span>{label}</span>
                    </Link>
                  </li>
                )
              })}
              {publicKey && (
                <li>
                  <Link
                    className={`px-3 py-1 rounded text-xs font-semibold tracking-wider transition-all inline-flex items-center gap-1.5 ${
                      isActive(`/profile/${publicKey.toBase58()}`)
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                        : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-900/60 border border-transparent'
                    }`}
                    href={`/profile/${publicKey.toBase58()}`}
                  >
                    <span className="text-emerald-500/60 text-[10px]">&gt;</span>
                    <span>PROFILE.dat</span>
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>

        {/* Mobile Menu Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-slate-300 hover:text-emerald-400"
          onClick={() => setShowMenu(!showMenu)}
        >
          {showMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {/* Desktop Telemetry Controls */}
        <div className="hidden md:flex items-center gap-3">
          <ClusterUiSelect />
          <WalletButton />
        </div>

        {/* Mobile Dropdown Menu */}
        {showMenu && (
          <div className="md:hidden fixed inset-x-0 top-[53px] bottom-0 bg-[#05090f]/98 backdrop-blur-xl z-50 p-6 space-y-6 border-t border-emerald-500/20 font-mono">
            <nav>
              <ul className="flex flex-col gap-2">
                {links.map(({ label, path }) => (
                  <li key={path}>
                    <Link
                      className={`block px-4 py-2.5 rounded text-xs font-semibold transition-all ${
                        isActive(path)
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                          : 'text-slate-400 hover:bg-slate-900'
                      }`}
                      href={path}
                      onClick={() => setShowMenu(false)}
                    >
                      &gt; {label}
                    </Link>
                  </li>
                ))}
                {publicKey && (
                  <li>
                    <Link
                      className={`block px-4 py-2.5 rounded text-xs font-semibold transition-all ${
                        isActive(`/profile/${publicKey.toBase58()}`)
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                          : 'text-slate-400 hover:bg-slate-900'
                      }`}
                      href={`/profile/${publicKey.toBase58()}`}
                      onClick={() => setShowMenu(false)}
                    >
                      &gt; PROFILE.dat
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-800">
              <ClusterUiSelect />
              <WalletButton />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
