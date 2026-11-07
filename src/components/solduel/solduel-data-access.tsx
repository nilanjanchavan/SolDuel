'use client';

import { useMemo, useState, useEffect } from 'react';
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useAnchorProvider } from '@/components/solana/solana-provider';
import { getSolduelProgram } from '@project/anchor';
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

export {
  MPL_CORE_PROGRAM_ID,
  BADGE_FIRST_WIN,
  BADGE_3_WIN_STREAK,
  BADGE_WORD_MASTER,
  BADGE_HIGH_ROLLER,
  BADGE_MINTED_MASK_SHIFT,
  BADGE_DEFINITIONS,
  PROFILE_DISCRIMINATOR,
  hasProfileDiscriminator,
  decodeProfileBuffer,
  calculateRatingChange,
} from './profile-utils';
export type { BadgeInfo, ProfileAccountData } from './profile-utils';
import {
  MPL_CORE_PROGRAM_ID,
  BADGE_DEFINITIONS,
  hasProfileDiscriminator,
  decodeProfileBuffer,
  ProfileAccountData,
} from './profile-utils';

/**
 * Returns the Program instance connected with the active wallet provider.
 */
export function useSolduelProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const provider = useAnchorProvider();
  const program = getSolduelProgram(provider);

  return {
    program,
    provider,
    connection,
    wallet,
  };
}

/**
 * Derives the PDA for a match room created by a wallet.
 *
 * @param creator Creator public key
 * @returns [PublicKey, number] PDA address and bump
 */
export function getRoomPda(creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ROOM_SEED), creator.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derives the PDA for a player's profile account.
 *
 * @param player Player public key
 * @returns [PublicKey, number] PDA address and bump
 */
export function getProfilePda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROFILE_SEED), player.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derives the PDA for a matchmaking waiting spot given game and stake tier.
 *
 * @param game Game kind index (0..3)
 * @param tier Stake tier index (0..2)
 * @returns [PublicKey, number] PDA address and bump
 */
export function getWaitingSpotPda(game: number, tier: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(WAITING_SPOT_SEED), Buffer.from([game]), Buffer.from([tier])],
    PROGRAM_ID
  );
}

/**
 * Converts coin stake tier to lamports.
 *
 * @param tier Stake tier index (0..2)
 * @returns Lamports required for stake
 */
export function tierToLamports(tier: number): number {
  const coins = STAKE_TIERS_COINS[tier] || 100;
  return coins * LAMPORTS_PER_COIN;
}

/**
 * SolDuel Room Status enum matching Anchor on-chain status.
 */
export enum RoomStatus {
  Open = 0,
  Active = 1,
  Finished = 2,
  Cancelled = 3,
}

/**
 * Deserialized representation of MatchRoom on-chain account.
 */
export interface MatchRoomAccountData {
  game: number;
  tier: number;
  creator: PublicKey;
  players: [PublicKey, PublicKey];
  status: RoomStatus;
  allowedOpponent: PublicKey | null;
  isQuickPlay: boolean;
  firstPlayer: number;
  createdTs: number;
  lastActionTs: number;
  deadlineTs: number;
  state: Uint8Array;
  bump: number;
}

/**
 * React Query hook to fetch and subscribe to a MatchRoom account.
 *
 * @param address Base58 public key string of the room PDA
 */
export function useRoomAccount(address: string) {
  const { program, connection } = useSolduelProgram();

  const roomPubkey = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);

  const query = useQuery({
    queryKey: ['room', address],
    queryFn: async (): Promise<MatchRoomAccountData | null> => {
      if (!roomPubkey) return null;
      try {
        const acc = await program.account.matchRoom.fetch(roomPubkey);
        return {
          game: acc.game,
          tier: acc.tier,
          creator: acc.creator,
          players: [acc.players[0], acc.players[1]],
          status: acc.status as unknown as RoomStatus,
          allowedOpponent: acc.allowedOpponent,
          isQuickPlay: acc.isQuickPlay,
          firstPlayer: acc.firstPlayer,
          createdTs: Number(acc.createdTs),
          lastActionTs: Number(acc.lastActionTs),
          deadlineTs: Number(acc.deadlineTs),
          state: Uint8Array.from(acc.state),
          bump: acc.bump,
        };
      } catch (err: unknown) {
        const errStr = String(err);
        if (
          errStr.includes('Account does not exist') ||
          errStr.includes('could not find account')
        ) {
          return null;
        }
        // Check account info directly to distinguish between absent account vs RPC error
        const info = await connection.getAccountInfo(roomPubkey);
        if (!info || info.data.length === 0) {
          return null;
        }
        // Re-throw transient network or rate-limit errors
        throw err;
      }
    },
    enabled: !!roomPubkey,
    refetchInterval: 2000,
  });

  return {
    room: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isAccountClosed: query.isSuccess && query.data === null,
    refetch: query.refetch,
    roomPubkey,
  };
}

/**
 * React Query hook to fetch and subscribe to a Profile account by either wallet address or profile PDA.
 *
 * @param address Base58 wallet or profile PDA address
 */
export function useProfileAccount(address: string) {
  const { program, connection } = useSolduelProgram();

  const parsedPubkey = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);

  const pdaQuery = useQuery({
    queryKey: ['profile-pda-lookup', parsedPubkey?.toBase58()],
    queryFn: async (): Promise<{ pda: PublicKey; isDirectPda: boolean } | null> => {
      if (!parsedPubkey) return null;
      const info = await connection.getAccountInfo(parsedPubkey);
      if (
        info &&
        info.owner.equals(PROGRAM_ID) &&
        info.data.length >= 67 &&
        hasProfileDiscriminator(info.data)
      ) {
        return { pda: parsedPubkey, isDirectPda: true };
      }
      return { pda: getProfilePda(parsedPubkey)[0], isDirectPda: false };
    },
    enabled: !!parsedPubkey,
    staleTime: 60000,
    refetchInterval: (queryState) => {
      // Periodically recheck while classified as wallet without a direct PDA
      if (queryState.state.data && !queryState.state.data.isDirectPda) {
        return 5000;
      }
      return false;
    },
  });

  const profilePda = pdaQuery.data?.pda ?? null;
  const isDirectPda = pdaQuery.data?.isDirectPda ?? false;

  const query = useQuery({
    queryKey: ['profile', address, profilePda?.toBase58()],
    queryFn: async (): Promise<ProfileAccountData | null> => {
      if (!profilePda) return null;
      try {
        const acc = await program.account.profile.fetch(profilePda);
        return {
          wins: Number(acc.wins),
          losses: Number(acc.losses),
          draws: Number(acc.draws),
          rating: Number(acc.rating) || 1000,
          streak: Number(acc.streak),
          bestStreak: Number(acc.bestStreak),
          badges: Number(acc.badges),
          activeRoom: acc.activeRoom,
          bump: acc.bump,
        };
      } catch {
        // Fallback to raw account info if Anchor IDL decoding differs
        const info = await connection.getAccountInfo(profilePda);
        if (info && info.data.length >= 67 && hasProfileDiscriminator(info.data)) {
          return decodeProfileBuffer(info.data);
        }
        return null;
      }
    },
    enabled: !!profilePda,
    refetchInterval: 5000,
  });

  const isClassified = !pdaQuery.isLoading && pdaQuery.data !== undefined;

  return {
    profile: query.data,
    isLoading: pdaQuery.isLoading || (!!profilePda && query.isLoading),
    isClassified,
    isError: pdaQuery.isError || query.isError,
    error: pdaQuery.error || query.error,
    refetch: () => {
      pdaQuery.refetch();
      query.refetch();
    },
    profilePda,
    isDirectPda,
    walletPubkey: isClassified && !isDirectPda ? parsedPubkey : null,
  };
}

/**
 * Mutation hook to mint an earned badge as a soulbound Metaplex Core NFT.
 */
export function useMintBadge() {
  const { program, wallet } = useSolduelProgram();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ badgeIndex }: { badgeIndex: number }) => {
      if (!wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      const [profilePda] = getProfilePda(wallet.publicKey);
      const assetKeypair = Keypair.generate();

      const tx = await program.methods
        .mintBadge(badgeIndex)
        .accounts({
          player: wallet.publicKey,
        })
        .remainingAccounts([
          { pubkey: assetKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
        ])
        .signers([assetKeypair])
        .rpc();

      return { tx, assetPublicKey: assetKeypair.publicKey };
    },
    onSuccess: (data, variables) => {
      const badgeDef = BADGE_DEFINITIONS.find((b) => b.index === variables.badgeIndex);
      toast.success(
        `Minted ${badgeDef?.name || 'Badge'} soulbound asset on Metaplex Core!`,
        {
          description: `Tx: ${data.tx.slice(0, 10)}...${data.tx.slice(-8)}`,
        }
      );
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (err: unknown) => {
      console.error('Mint badge error:', err);
      const message = err instanceof Error ? err.message : 'Check wallet balance and permissions';
      toast.error('Failed to mint badge', {
        description: message,
      });
    },
  });
}

/**
 * Entry structure for players displayed on the SolDuel global leaderboard.
 */
export interface LeaderboardEntry {
  profilePda: string;
  wallet: string;
  shortAddress: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  streak: number;
  bestStreak: number;
  badges: number;
  badgeCount: number;
}

/**
 * React Query hook to fetch all registered player profiles for the leaderboard.
 */
export function useLeaderboard() {
  const { program } = useSolduelProgram();

  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const results: LeaderboardEntry[] = [];

      try {
        const accounts = await program.account.profile.all();
        if (accounts && accounts.length > 0) {
          for (const item of accounts) {
            const acc = item.account;
            const wins = Number(acc.wins) || 0;
            const losses = Number(acc.losses) || 0;
            const draws = Number(acc.draws) || 0;
            const totalGames = wins + losses + draws;
            const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
            const badgesVal = Number(acc.badges) || 0;

            let badgeCount = 0;
            for (let i = 0; i < 4; i++) {
              if ((badgesVal & (1 << i)) !== 0) badgeCount++;
            }

            const pdaStr = item.publicKey.toBase58();
            results.push({
              profilePda: pdaStr,
              wallet: pdaStr,
              shortAddress: `${pdaStr.slice(0, 4)}...${pdaStr.slice(-4)}`,
              rating: Number(acc.rating) || 1000,
              wins,
              losses,
              draws,
              winRate,
              streak: Number(acc.streak) || 0,
              bestStreak: Number(acc.bestStreak) || 0,
              badges: badgesVal,
              badgeCount,
            });
          }
        }
      } catch (err) {
        console.warn('Leaderboard program accounts fetch error:', err);
        throw err;
      }

      // Sort by rating descending
      return results.sort((a, b) => b.rating - a.rating);
    },
    refetchInterval: 10000,
  });
}
