'use client';

import { useMemo } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useAnchorProvider } from '@/components/solana/solana-provider';
import { getSolduelProgram, Solduel } from '@project/anchor';
import {
  PROGRAM_ID,
  ROOM_SEED,
  PROFILE_SEED,
  WAITING_SPOT_SEED,
  STAKE_TIERS_COINS,
  LAMPORTS_PER_COIN,
  QUICK_PLAY_EXPIRY_SECS,
} from '@/config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function getRoomPda(creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ROOM_SEED), creator.toBuffer()],
    PROGRAM_ID
  );
}

export function getProfilePda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROFILE_SEED), wallet.toBuffer()],
    PROGRAM_ID
  );
}

export function getWaitingSpotPda(game: number, tier: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(WAITING_SPOT_SEED), Buffer.from([game]), Buffer.from([tier])],
    PROGRAM_ID
  );
}

export function useSolduelProgram() {
  const provider = useAnchorProvider();
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    return getSolduelProgram(provider, PROGRAM_ID);
  }, [provider]);

  return {
    program,
    provider,
    connection,
    wallet,
  };
}

export function useRoomAccount(address: string) {
  const { program, connection } = useSolduelProgram();
  const queryClient = useQueryClient();

  const roomPubkey = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);

  const query = useQuery({
    queryKey: ['room', address],
    queryFn: async () => {
      if (!roomPubkey) return null;
      try {
        const acc = await (program.account as any).matchRoom.fetch(roomPubkey);
        return acc;
      } catch (err) {
        console.warn('Room fetch error (may be closed or empty):', err);
        return null;
      }
    },
    enabled: !!roomPubkey,
    refetchInterval: 2000,
  });

  return {
    room: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    roomPubkey,
  };
}

