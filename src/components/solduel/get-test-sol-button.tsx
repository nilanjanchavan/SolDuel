'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Button component providing one-click Solana Devnet airdrop with fallback to official faucet.
 */
export function GetTestSolButton() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [isRequesting, setIsRequesting] = useState(false);
  const queryClient = useQueryClient();

  const { data: balance } = useQuery({
    queryKey: ['wallet-balance', publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return 0;
      const lamports = await connection.getBalance(publicKey);
      return lamports / LAMPORTS_PER_SOL;
    },
    enabled: !!publicKey,
    refetchInterval: 5000,
  });

  const handleGetSol = async () => {
    if (!publicKey) {
      toast.error('Connect your wallet first');
      return;
    }

    setIsRequesting(true);
    try {
      toast.info('Requesting 1 test SOL on devnet...');
      const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL);
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: sig,
        ...latestBlockhash,
      });
      toast.success('Received 1 Devnet SOL!');
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Devnet airdrop request failed';
      console.warn('Airdrop failed:', errorMsg);
      const faucetUrl = `https://faucet.solana.com/?address=${publicKey.toBase58()}`;
      toast.error(`Airdrop request failed: ${errorMsg}`, {
        action: {
          label: 'Open Official Faucet',
          onClick: () => window.open(faucetUrl, '_blank'),
        },
      });
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {publicKey && balance !== undefined && (
        <span className="text-xs bg-neutral-200 dark:bg-neutral-800 px-2.5 py-1 rounded-full font-mono font-medium">
          {balance.toFixed(2)} SOL
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={isRequesting || !publicKey}
        onClick={handleGetSol}
        className="flex items-center gap-1.5 border-purple-500/30 hover:border-purple-500 text-purple-600 dark:text-purple-400"
      >
        {isRequesting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        <span>Get Test SOL</span>
      </Button>
      {publicKey && (
        <a
          href={`https://faucet.solana.com/?address=${publicKey.toBase58()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs flex items-center gap-0.5"
          title="Open Solana Devnet Faucet"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
