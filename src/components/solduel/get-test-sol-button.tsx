'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { ExternalLink, Droplet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

/**
 * Component displaying real-time devnet SOL balance and a direct link to the official Solana faucet.
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
    <div className="flex flex-wrap items-center gap-2.5">
      {publicKey && balance !== undefined && (
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 px-3.5 py-1.5 rounded-xl shadow-inner text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
          <span className="text-slate-400">Balance:</span>
          <span className="font-bold text-amber-300">{balance.toFixed(2)} SOL</span>
          <span className="text-[10px] text-slate-500">({(balance * 10_000).toLocaleString()} coins)</span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => window.open(faucetUrl, '_blank', 'noopener,noreferrer')}
        className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-600/10 hover:from-amber-500/20 hover:to-amber-500/25 text-amber-300 border-amber-500/40 hover:border-amber-400 font-semibold cursor-pointer rounded-xl transition-all shadow-sm shadow-amber-500/10"
      >
        <Droplet className="h-3.5 w-3.5 text-amber-400 fill-amber-400/30" />
        <span>Solana Faucet</span>
        <ExternalLink className="h-3 w-3 opacity-70 ml-0.5" />
      </Button>
    </div>
  )
}
