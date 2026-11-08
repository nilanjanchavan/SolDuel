'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { ExternalLink, Terminal } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

/**
 * High-tech terminal balance display and direct external link to the Solana devnet faucet.
 */
export function GetTestSolButton() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()

  const { data: balance } = useQuery({
    queryKey: ['wallet-balance', publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return 0
      const lamports = await connection.getBalance(publicKey)
      return lamports / LAMPORTS_PER_SOL
    },
    enabled: !!publicKey,
    refetchInterval: 5000,
  })

  const faucetUrl = publicKey
    ? `https://faucet.solana.com/?address=${publicKey.toBase58()}`
    : 'https://faucet.solana.com'

  return (
    <div className="flex flex-wrap items-center gap-2.5 font-mono">
      {publicKey && balance !== undefined && (
        <div className="flex items-center gap-2 bg-[#05090f] border border-emerald-500/30 px-3 py-1.5 rounded text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400 font-bold">BAL:</span>
          <span className="font-bold text-emerald-300">{balance.toFixed(2)} SOL</span>
          <span className="text-[10px] text-slate-400">({(balance * 10_000).toLocaleString()} coins)</span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => window.open(faucetUrl, '_blank', 'noopener,noreferrer')}
        className="flex items-center gap-1.5 bg-cyan-950/40 hover:bg-cyan-950/70 text-cyan-300 border-cyan-500/40 hover:border-cyan-400 font-mono text-xs font-bold cursor-pointer rounded transition-all shadow-[0_0_8px_rgba(6,182,212,0.2)]"
      >
        <Terminal className="h-3.5 w-3.5 text-cyan-400" />
        <span>+ REFUEL_FAUCET</span>
        <ExternalLink className="h-3 w-3 opacity-80" />
      </Button>
    </div>
  )
}
