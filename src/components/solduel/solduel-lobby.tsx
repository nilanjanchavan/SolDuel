'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GetTestSolButton } from './get-test-sol-button';
import {
  useSolduelProgram,
  getRoomPda,
  getProfilePda,
  getWaitingSpotPda,
} from './solduel-data-access';
import {
  STAKE_TIERS_COINS,
  LAMPORTS_PER_COIN,
  QUICK_PLAY_EXPIRY_SECS,
} from '@/config';
import {
  Zap,
  Plus,
  Users,
  Shield,
  ShieldCheck,
  Sparkles,
  Lock,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

interface GameItem {
  id: number;
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  desc: string;
  skill: boolean;
  accent: string;
  borderActive: string;
}

const GAMES: GameItem[] = [
  {
    id: 0,
    slug: 'connect-four',
    name: 'Connect Four',
    icon: '🔴',
    tagline: '7×6 Gravity Grid',
    desc: 'Tactical 4-in-a-row duel with turn clock and gravity drops.',
    skill: true,
    accent: 'from-rose-500/10 to-red-600/10 text-rose-300',
    borderActive: 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-950/20',
  },
  {
    id: 1,
    slug: 'word-chain',
    name: 'Word Chain',
    icon: '🔤',
    tagline: 'Speed Vocabulary',
    desc: 'Prefix word chain verified on-chain via Merkle dictionary tree.',
    skill: true,
    accent: 'from-emerald-500/10 to-teal-600/10 text-emerald-300',
    borderActive: 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-950/20',
  },
  {
    id: 2,
    slug: 'rps',
    name: 'Rock Paper Scissors',
    icon: '✂️',
    tagline: 'Best of 3 Duel',
    desc: 'Classic faceoff with provably fair SHA-256 commit-reveal.',
    skill: false,
    accent: 'from-amber-500/10 to-orange-600/10 text-amber-300',
    borderActive: 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-950/20',
  },
  {
    id: 3,
    slug: 'dice',
    name: 'Dice Duel',
    icon: '🎲',
    tagline: 'High Roller Duel',
    desc: 'Joint-entropy 6-sided dice roll. Highest roll takes the pot.',
    skill: false,
    accent: 'from-violet-500/10 to-purple-600/10 text-violet-300',
    borderActive: 'border-violet-500 ring-2 ring-violet-500/30 bg-violet-950/20',
  },
];

const TIER_META = [
  { label: 'Casual Duel', subtitle: 'Warm-up match', badge: 'Tier 1' },
  { label: 'Challenger', subtitle: 'Standard stake', badge: 'Tier 2' },
  { label: 'High Roller', subtitle: 'Unlocks badge 👑', badge: 'Tier 3' },
];

/**
 * Main SolDuel Lobby component providing Quick Play matchmaking and custom room creation.
 */
export function SolduelLobby() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const opponentParam = searchParams.get('opponent');
  const { program, wallet } = useSolduelProgram();

  const initialGame = useMemo(() => {
    const p = searchParams.get('game');
    if (p !== null) {
      const val = parseInt(p, 10);
      if (!isNaN(val) && val >= 0 && val <= 3) {
        return val;
      }
    }
    return 0;
  }, [searchParams]);

  const initialTier = useMemo(() => {
    const p = searchParams.get('tier');
    if (p !== null) {
      const val = parseInt(p, 10);
      if (!isNaN(val) && val >= 0 && val <= 2) {
        return val;
      }
    }
    return 0;
  }, [searchParams]);

  const initialTab = useMemo(() => {
    if (opponentParam) return 'custom';
    const p = searchParams.get('tab');
    return p === 'custom' ? 'custom' : 'quick';
  }, [searchParams, opponentParam]);

  const [selectedGame, setSelectedGame] = useState<number>(initialGame);
  const [selectedTier, setSelectedTier] = useState<number>(initialTier);
  const [allowedOpponent, setAllowedOpponent] = useState<string>(opponentParam || '');
  const [isCreating, setIsCreating] = useState(false);
  const [isQuickPlaying, setIsQuickPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'custom'>(initialTab);

  const currentGame = GAMES[selectedGame] || GAMES[0];
  const currentStakeCoins = STAKE_TIERS_COINS[selectedTier] || 100;
  const currentStakeSol = (currentStakeCoins * LAMPORTS_PER_COIN) / 1_000_000_000;
  const totalPotCoins = currentStakeCoins * 2;
  const totalPotSol = (currentStakeSol * 2).toFixed(2);

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

      // Check waiting spot info to see if an opponent is already queued or spot is expired
      let targetRoom = myRoomPda;
      const remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];

      try {
        const spotAccountInfo = await program.provider.connection.getAccountInfo(waitingSpotPda);
        if (spotAccountInfo && spotAccountInfo.data.length >= 48) {
          const roomInSpot = new PublicKey(spotAccountInfo.data.slice(8, 40));
          if (!roomInSpot.equals(PublicKey.default)) {
            // First check if the user is already the waiting creator in this spot
            if (roomInSpot.equals(myRoomPda)) {
              toast.info('You already have an open waiting room in this Quick Play queue.');
              router.push(`/room/${myRoomPda.toBase58()}`);
              return;
            }

            const createdTs = Number(spotAccountInfo.data.readBigInt64LE(40));
            let now = Math.floor(Date.now() / 1000);
            try {
              const slot = await program.provider.connection.getSlot('confirmed');
              const blockTime = await program.provider.connection.getBlockTime(slot);
              if (blockTime !== null) {
                now = blockTime;
              }
            } catch (timeErr) {
              console.warn('Could not fetch cluster block time, using local clock:', timeErr);
            }

            const isExpired = now - createdTs > QUICK_PLAY_EXPIRY_SECS;

            if (isExpired) {
              // Spot has expired: caller reclaims the spot by creating myRoomPda
              // and passes the expired room, creator, and profile for cleanup & refund
              targetRoom = myRoomPda;
              remainingAccounts.push({
                pubkey: roomInSpot,
                isWritable: true,
                isSigner: false,
              });

              try {
                const oldRoomAcc = await (program.account as any).matchRoom.fetchNullable(roomInSpot);
                if (oldRoomAcc && oldRoomAcc.creator) {
                  const oldCreator = oldRoomAcc.creator as PublicKey;
                  const [oldProfilePda] = getProfilePda(oldCreator);
                  remainingAccounts.push({
                    pubkey: oldCreator,
                    isWritable: true,
                    isSigner: false,
                  });
                  remainingAccounts.push({
                    pubkey: oldProfilePda,
                    isWritable: true,
                    isSigner: false,
                  });
                }
              } catch (fetchErr) {
                console.warn('Could not fetch old room for creator cleanup:', fetchErr);
              }
            } else {
              // Valid unexpired room queued by an opponent: join it
              targetRoom = roomInSpot;
            }
          }
        }
      } catch (err) {
        console.warn('Waiting spot fetch error (may be empty or uninitialized):', err);
      }

      toast.info('Joining or matching in Quick Play...');
      let methodBuilder = (program.methods as any)
        .quickPlay(selectedGame, selectedTier)
        .accounts({
          waitingSpot: waitingSpotPda,
          room: targetRoom,
          profile: myProfilePda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        });

      if (remainingAccounts.length > 0) {
        methodBuilder = methodBuilder.remainingAccounts(remainingAccounts);
      }

      await methodBuilder.rpc();

      toast.success('Quick Play match registered!');
      router.push(`/room/${targetRoom.toBase58()}`);
    } catch (err: unknown) {
      console.error('Quick Play error:', err);
      const msg = err instanceof Error ? err.message : 'Quick Play failed. Make sure you have enough SOL.';
      toast.error(msg);
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

      toast.info('Creating match room...');
      await program.methods
        .createRoom(selectedGame, selectedTier, opponentPubkey)
        .accounts({
          creator: wallet.publicKey,
        })
        .rpc();

      toast.success('Room created! Redirecting to lobby...');
      router.push(`/room/${myRoomPda.toBase58()}`);
    } catch (err: unknown) {
      console.error('Create room error:', err);
      const msg = err instanceof Error ? err.message : 'Room creation failed';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Hero Marquee Arena Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 p-6 md:p-8 shadow-2xl shadow-black/60">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-400 motion-safe:animate-ping" />
              <span>Staked 1v1 Arena • Solana Devnet</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              Duel Challengers, <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">Win the Pot</span>
            </h1>
            <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
              Decentralized peer-to-peer gaming. Both players escrow stakes into an on-chain PDA room; victorious play claims the entire pot.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <GetTestSolButton />
          </div>
        </div>

        {/* Practice Mode Callout Bar */}
        <div className="relative z-10 mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs">
              🛡️
            </div>
            <span>
              <strong>Zero wallet required:</strong> Duel our autonomous AI bots offline in Practice Sandbox.
            </span>
          </div>
          <Link
            href={`/play/${currentGame.slug}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition-all hover:scale-105 active:scale-95 shadow-sm"
          >
            <span>Play Practice Bot ({currentGame.name})</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* 1. Game Selection Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">1</span>
            Select Minigame
          </Label>
          <span className="text-xs text-slate-500">All games resolve on-chain</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {GAMES.map((game) => {
            const isSelected = selectedGame === game.id;
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => setSelectedGame(game.id)}
                className={`relative p-4 rounded-2xl border text-left transition-all cursor-pointer group flex flex-col justify-between min-h-[140px] ${
                  isSelected
                    ? game.borderActive + ' shadow-lg shadow-black/40 scale-[1.02]'
                    : 'border-slate-800/90 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900/90'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-2xl group-hover:scale-110 transition-transform">{game.icon}</span>
                    {game.skill ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Skill • Rating
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Luck • Casual
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-base text-slate-100 group-hover:text-amber-300 transition-colors">
                    {game.name}
                  </h3>
                  <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                    {game.tagline}
                  </p>
                </div>

                <p className="text-[11px] text-slate-400 mt-3 line-clamp-2 leading-relaxed">
                  {game.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Stake Tier Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">2</span>
            Select Stake Tier
          </Label>
          <span className="text-xs text-slate-400 font-mono">
            1 Coin = 0.0001 SOL (100,000 lamports)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {STAKE_TIERS_COINS.map((coins, tierIdx) => {
            const solAmount = (coins * LAMPORTS_PER_COIN) / 1_000_000_000;
            const meta = TIER_META[tierIdx] || TIER_META[0];
            const isSelected = selectedTier === tierIdx;

            return (
              <button
                key={tierIdx}
                type="button"
                onClick={() => setSelectedTier(tierIdx)}
                className={`p-4 rounded-2xl border text-center transition-all cursor-pointer relative ${
                  isSelected
                    ? 'border-amber-500/80 bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-950 ring-2 ring-amber-500/30 shadow-lg shadow-amber-950/20 scale-[1.02]'
                    : 'border-slate-800/90 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900/90 text-slate-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="font-semibold text-slate-400">{meta.badge}</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {meta.label}
                  </span>
                </div>

                <div className="text-2xl font-extrabold text-white tracking-tight mt-1">
                  {coins} <span className="text-amber-400 text-lg font-bold">Coins</span>
                </div>
                <div className="text-xs font-mono font-medium text-slate-400 mt-0.5">
                  {solAmount} SOL stake
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Total Pot: <strong className="text-slate-300">{coins * 2} Coins</strong> ({solAmount * 2} SOL)
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Matchmaking Mode Tabs & Action Container */}
      <div className="space-y-4">
        {/* Tab Switcher Pills */}
        <div className="flex bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 max-w-md">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2 px-4 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'quick'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="h-4 w-4" />
            <span>Quick Play Queue</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-2 px-4 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>Create Private Room</span>
          </button>
        </div>

        {/* Action Card */}
        {activeTab === 'quick' ? (
          <div className="p-6 md:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-400" />
                  Instant On-Chain Matchmaking
                </h3>
                <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
                  Instantly pairs you with any challenger waiting in the <strong>{currentGame.name}</strong> queue at <strong>{currentStakeCoins} Coins</strong>. If none is active, posts a 120-second on-chain spot for challengers to join.
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 px-4 py-3 rounded-2xl text-right shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Pot Prize</span>
                <span className="text-xl font-extrabold text-amber-400">{totalPotCoins} Coins</span>
                <span className="text-xs text-slate-400 block font-mono">({totalPotSol} SOL)</span>
              </div>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold py-6 text-base rounded-2xl shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              disabled={isQuickPlaying}
              onClick={handleQuickPlay}
            >
              {isQuickPlaying ? (
                <span>Entering Queue...</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>Enter Quick Play Duel</span>
                  <span className="font-mono text-sm opacity-90">({currentStakeSol} SOL)</span>
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </div>
        ) : (
          <div className="p-6 md:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-400" />
                  Private or Challenge Room
                </h3>
                <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
                  Creates a dedicated on-chain MatchRoom PDA. You receive a unique invite link to send directly to your friend or opponent.
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 px-4 py-3 rounded-2xl text-right shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Stake Required</span>
                <span className="text-xl font-extrabold text-amber-400">{currentStakeCoins} Coins</span>
                <span className="text-xs text-slate-400 block font-mono">({currentStakeSol} SOL)</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opponent" className="text-xs font-semibold text-slate-300">
                Restrict to Specific Opponent Address (Optional)
              </Label>
              <Input
                id="opponent"
                placeholder="Leave blank for open invite link, or enter opponent's Solana address"
                value={allowedOpponent}
                onChange={(e) => setAllowedOpponent(e.target.value)}
                className="font-mono text-xs bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 rounded-xl py-3"
              />
            </div>

            <Button
              className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold py-6 text-base rounded-2xl shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
              disabled={isCreating}
              onClick={handleCreateCustomRoom}
            >
              {isCreating ? 'Creating Room...' : `Create Room & Get Link (${currentStakeSol} SOL)`}
            </Button>
          </div>
        )}
      </div>

      {/* Trustless Security Micro-Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80">
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-800/70">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Lock className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Non-Custodial Escrow</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Stakes sit securely in a program-derived address (PDA). Only match outcomes can trigger payouts.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-800/70">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Provably Fair Logic</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Rules execute deterministically on Solana. Tied rounds or room cancellations trigger full refunds.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-800/70">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Timeout Payout Protection</h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              If an opponent stalls past their action deadline plus 5s grace, claim an instant timeout victory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
