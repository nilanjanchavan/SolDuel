'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GetTestSolButton } from './get-test-sol-button';
import {
  useSolduelProgram,
  getRoomPda,
  getProfilePda,
  getWaitingSpotPda,
} from './solduel-data-access';
import { STAKE_TIERS_COINS, LAMPORTS_PER_COIN } from '@/config';
import { Swords, Zap, Plus, Users, Shield, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const GAMES = [
  { id: 0, name: 'Connect Four', desc: '7x6 tactical gravity grid', skill: true },
  { id: 1, name: 'Word Chain', desc: 'Prefix vocabulary speed duel', skill: true },
  { id: 2, name: 'Rock Paper Scissors', desc: 'Best of 3 commit-reveal', skill: false },
  { id: 3, name: 'Dice Duel', desc: 'Provably fair high roller', skill: false },
];

export function SolduelLobby() {
  const router = useRouter();
  const { program, wallet } = useSolduelProgram();
  const [selectedGame, setSelectedGame] = useState<number>(0);
  const [selectedTier, setSelectedTier] = useState<number>(0);
  const [allowedOpponent, setAllowedOpponent] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [isQuickPlaying, setIsQuickPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'custom'>('quick');

  const handleQuickPlay = async () => {
    if (!wallet.publicKey) {
      toast.error('Connect your wallet first');
      return;
    }

    setIsQuickPlaying(true);
    try {
      const [waitingSpotPda] = getWaitingSpotPda(selectedGame, selectedTier);
      const [myRoomPda] = getRoomPda(wallet.publicKey);
      const [myProfilePda] = getProfilePda(wallet.publicKey);

      // Fetch waiting spot info to see if a room is already queued
      let targetRoom = myRoomPda;
      try {
        const spotAccountInfo = await program.provider.connection.getAccountInfo(waitingSpotPda);
        if (spotAccountInfo && spotAccountInfo.data.length >= 40) {
          const roomInSpot = new PublicKey(spotAccountInfo.data.slice(8, 40));
          if (!roomInSpot.equals(PublicKey.default) && !roomInSpot.equals(myRoomPda)) {
            targetRoom = roomInSpot;
          }
        }
      } catch (err) {
        console.warn('Waiting spot fetch error (may be empty):', err);
      }

      toast.info('Joining or matching in Quick Play...');
      const tx = await (program.methods as any)
        .quickPlay(selectedGame, selectedTier)
        .accounts({
          waitingSpot: waitingSpotPda,
          room: targetRoom,
          profile: myProfilePda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success('Quick Play match registered!');
      router.push(`/room/${targetRoom.toBase58()}`);
    } catch (err: any) {
      console.error('Quick Play error:', err);
      toast.error(err.message || 'Quick Play failed. Make sure you have enough SOL.');
    } finally {
      setIsQuickPlaying(false);
    }
  };

  const handleCreateCustomRoom = async () => {
    if (!wallet.publicKey) {
      toast.error('Connect your wallet first');
      return;
    }

    setIsCreating(true);
    try {
      let opponentPubkey: PublicKey | null = null;
      if (allowedOpponent.trim()) {
        try {
          opponentPubkey = new PublicKey(allowedOpponent.trim());
        } catch {
          toast.error('Invalid opponent public key');
          setIsCreating(false);
          return;
        }
      }

      const [myRoomPda] = getRoomPda(wallet.publicKey);
      const [myProfilePda] = getProfilePda(wallet.publicKey);

      toast.info('Creating match room...');
      await (program.methods as any)
        .createRoom(selectedGame, selectedTier, opponentPubkey)
        .accounts({
          room: myRoomPda,
          profile: myProfilePda,
          creator: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success('Room created! Redirecting to lobby...');
      router.push(`/room/${myRoomPda.toBase58()}`);
    } catch (err: any) {
      console.error('Create room error:', err);
      toast.error(err.message || 'Room creation failed');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6">
      {/* Header & Faucet Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-neutral-100 dark:bg-neutral-900/60 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <Swords className="h-7 w-7 text-purple-600 dark:text-purple-400" />
            <h1 className="text-3xl font-bold tracking-tight">SolDuel</h1>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Staked 1v1 on-chain minigames on Solana Devnet.
          </p>
        </div>
        <GetTestSolButton />
      </div>

      {/* Game Selection */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">1. Choose a Minigame</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => setSelectedGame(game.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                selectedGame === game.id
                  ? 'border-purple-500 bg-purple-500/10 shadow-sm ring-2 ring-purple-500/20'
                  : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900'
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="font-semibold text-base">{game.name}</span>
                {game.skill ? (
                  <span className="text-[10px] bg-blue-500/20 text-blue-600 dark:text-blue-400 font-mono px-1.5 py-0.5 rounded">
                    SKILL
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono px-1.5 py-0.5 rounded">
                    LUCK
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {game.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Stake Tier Selection */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label className="text-base font-semibold">2. Select Stake Tier</Label>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            1 coin = 0.0001 SOL (100,000 lamports)
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {STAKE_TIERS_COINS.map((coins, tierIdx) => {
            const solAmount = (coins * LAMPORTS_PER_COIN) / 1_000_000_000;
            return (
              <button
                key={tierIdx}
                type="button"
                onClick={() => setSelectedTier(tierIdx)}
                className={`py-3 px-4 rounded-xl border text-center transition-all ${
                  selectedTier === tierIdx
                    ? 'border-purple-500 bg-purple-500/10 shadow-sm ring-2 ring-purple-500/20'
                    : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-white dark:bg-neutral-900'
                }`}
              >
                <div className="text-lg font-bold">{coins} Coins</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {solAmount} SOL
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Modes: Quick Play vs Custom Room */}
      <div className="space-y-4">
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`pb-3 font-semibold text-sm flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'quick'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <Zap className="h-4 w-4" />
            Quick Play Matchmaking
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`pb-3 font-semibold text-sm flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'custom'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <Plus className="h-4 w-4" />
            Create Invite Room
          </button>
        </div>

        {activeTab === 'quick' ? (
          <Card className="p-6 space-y-4 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Instant On-Chain Matchmaking
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Pairs you with any active waiting challenger in this game & tier, or posts a 120s waiting spot.
              </p>
            </div>
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 text-base"
              disabled={isQuickPlaying}
              onClick={handleQuickPlay}
            >
              {isQuickPlaying ? 'Matching...' : 'Find Match / Quick Play'}
            </Button>
          </Card>
        ) : (
          <Card className="p-6 space-y-4 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Create Private or Sharable Room
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Creates a room PDA that you can share with a friend via link.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opponent">Restrict to Opponent Public Key (Optional)</Label>
              <Input
                id="opponent"
                placeholder="Leave blank for open invite link, or enter Solana address"
                value={allowedOpponent}
                onChange={(e) => setAllowedOpponent(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 text-base"
              disabled={isCreating}
              onClick={handleCreateCustomRoom}
            >
              {isCreating ? 'Creating Room...' : 'Create Room & Get Link'}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}

