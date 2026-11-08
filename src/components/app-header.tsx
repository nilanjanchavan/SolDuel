'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import { ThemeSelect } from '@/components/theme-select'
import { ClusterUiSelect } from './cluster/cluster-ui'
import { WalletButton } from '@/components/solana/solana-provider'

/**
 * Main application navigation header with wallet connection, network selector, and theme toggle.
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
    <header className="sticky top-0 z-50 px-4 md:px-8 py-3 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 text-slate-200">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Brand Logo & Navigation */}
        <div className="flex items-center gap-8">
          <Link className="flex items-center gap-2.5 group" href="/">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center text-slate-950 text-sm font-extrabold shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              ⚔️
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                SOL<span className="text-amber-400">DUEL</span>
              </span>
              <span className="hidden sm:inline-block text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Devnet
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center">
            <ul className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800/90">
              {links.map(({ label, path }) => {
                const active = isActive(path)
                return (
                  <li key={path}>
                    <Link
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center ${
                        active
                          ? 'bg-slate-800 text-amber-300 border border-slate-700/80 shadow-sm shadow-black/40 font-bold'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                      }`}
                      href={path}
                    >
                      {label}
                    </Link>
                  </li>
                )
              })}
              {publicKey && (
                <li>
                  <Link
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center ${
                      isActive(`/profile/${publicKey.toBase58()}`)
                        ? 'bg-slate-800 text-amber-300 border border-slate-700/80 shadow-sm shadow-black/40 font-bold'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                    href={`/profile/${publicKey.toBase58()}`}
                  >
                    Profile 🏆
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
          className="md:hidden text-slate-300 hover:text-white"
          onClick={() => setShowMenu(!showMenu)}
        >
          {showMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6 text-slate-300" />}
        </Button>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center gap-3">
          <ClusterUiSelect />
          <WalletButton />
          <ThemeSelect />
        </div>

        {/* Mobile Dropdown Menu */}
        {showMenu && (
          <div className="md:hidden fixed inset-x-0 top-[57px] bottom-0 bg-slate-950/95 backdrop-blur-xl z-50 p-6 space-y-6 border-t border-slate-800">
            <nav>
              <ul className="flex flex-col gap-2">
                {links.map(({ label, path }) => (
                  <li key={path}>
                    <Link
                      className={`block px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                        isActive(path)
                          ? 'bg-slate-800 text-amber-300 border border-slate-700 font-bold'
                          : 'text-slate-300 hover:bg-slate-900'
                      }`}
                      href={path}
                      onClick={() => setShowMenu(false)}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
                {publicKey && (
                  <li>
                    <Link
                      className={`block px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                        isActive(`/profile/${publicKey.toBase58()}`)
                          ? 'bg-slate-800 text-amber-300 border border-slate-700 font-bold'
                          : 'text-slate-300 hover:bg-slate-900'
                      }`}
                      href={`/profile/${publicKey.toBase58()}`}
                      onClick={() => setShowMenu(false)}
                    >
                      Profile 🏆
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center">
                <ClusterUiSelect />
                <ThemeSelect />
              </div>
              <WalletButton />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
