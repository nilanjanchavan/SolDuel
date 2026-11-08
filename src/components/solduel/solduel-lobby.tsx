'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GetTestSolButton } from './get-test-sol-button';
import { CyberRulesTerminal } from './cyber-rules-terminal';
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
  Key,
  Terminal,
  Search,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

interface GameItem {
  id: number;
  slug: string;
  name: string;
  icon: string;
  skill: boolean;
  clock: string;
}

const GAMES: GameItem[] = [
  {
    id: 0,
    slug: 'connect-four',
    name: 'Connect Four',
    icon: '🔴',
    skill: true,
    clock: '60s',
  },
  {
    id: 1,
    slug: 'word-chain',
    name: 'Word Chain',
    icon: '🔤',
    skill: true,
    clock: '30s',
  },
  {
    id: 2,
    slug: 'rps',
    name: 'Rock Paper Scissors',
    icon: '✂️',
    skill: false,
    clock: '60s',
  },
  {
    id: 3,
    slug: 'dice',
    name: 'Dice Duel',
    icon: '🎲',
    skill: false,
    clock: '60s',
  },
];

const TIER_LABELS = ['Casual', 'Contender', 'High Roller 👑'];

/**
 * Sleek, uncluttered SolDuel Lobby.
 * Balances high-tech cyber style with clean, minimalist UX.
 */
export function SolduelLobby() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const opponentParam = searchParams.get('opponent');
  const { program, wallet, connection } = useSolduelProgram();

  const initialGame = useMemo(() => {
    const p = searchParams.get('game');
    if (p !== null) {
      const val = parseInt(p, 10);
      if (!isNaN(val) && val >= 0 && val <= 3) return val;
    }
    return 0;
  }, [searchParams]);

  const initialTier = useMemo(() => {
    const p = searchParams.get('tier');
    if (p !== null) {
      const val = parseInt(p, 10);
      if (!isNaN(val) && val >= 0 && val <= 2) return val;
    }
    return 0;
  }, [searchParams]);

  const initialTab = useMemo(() => {
    if (opponentParam) return 'create';
    const p = searchParams.get('tab');
    if (p === 'create') return 'create';
    if (p === 'join') return 'join';
    return 'quick';
  }, [searchParams, opponentParam]);

  const [selectedGame, setSelectedGame] = useState<number>(initialGame);
  const [hoveredGame, setHoveredGame] = useState<number | null>(null);
  const [selectedTier, setSelectedTier] = useState<number>(initialTier);
  const [allowedOpponent, setAllowedOpponent] = useState<string>(opponentParam || '');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isQuickPlaying, setIsQuickPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'create' | 'join'>(initialTab);

  const currentGame = GAMES[selectedGame] || GAMES[0];
  const activeInspectedGameId = hoveredGame !== null ? hoveredGame : selectedGame;
  const currentStakeCoins = STAKE_TIERS_COINS[selectedTier] || 100;
  const currentStakeSol = (currentStakeCoins * LAMPORTS_PER_COIN) / 1_000_000_000;
  const totalPotCoins = currentStakeCoins * 2;
  const totalPotSol = (currentStakeSol * 2).toFixed(2);

  // Quick Play handler
  const handleQuickPlay = async () => {
    if (!wallet.publicKey) {
      toast.error('Connect your Solana wallet to enter matchmaking');
      return;
    }

    setIsQuickPlaying(true);
    try {
      const [waitingSpotPda] = getWaitingSpotPda(selectedGame, selectedTier);
      const [myRoomPda] = getRoomPda(wallet.publicKey);
      const [myProfilePda] = getProfilePda(wallet.publicKey);

      let targetRoom = myRoomPda;
      const remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];

      try {
        const spotAccountInfo = await connection.getAccountInfo(waitingSpotPda);
        if (spotAccountInfo && spotAccountInfo.data.length >= 48) {
          const roomInSpot = new PublicKey(spotAccountInfo.data.slice(8, 40));
          if (!roomInSpot.equals(PublicKey.default)) {
            if (roomInSpot.equals(myRoomPda)) {
              toast.info('Active waiting room detected. Entering room...');
              router.push(`/room/${myRoomPda.toBase58()}`);
              return;
            }

            const createdTs = Number(spotAccountInfo.data.readBigInt64LE(40));
            let now = Math.floor(Date.now() / 1000);
            try {
              const slot = await connection.getSlot('confirmed');
              const blockTime = await connection.getBlockTime(slot);
              if (blockTime !== null) now = blockTime;
            } catch {}

            const isExpired = now - createdTs > QUICK_PLAY_EXPIRY_SECS;

            if (isExpired) {
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
              } catch {}
            } else {
              targetRoom = roomInSpot;
            }
          }
        }
      } catch (err) {
        console.warn('Waiting spot read error:', err);
      }

      toast.info('Submitting quick_play transaction...');
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

      toast.success('Matchroom confirmed on-chain!');
      router.push(`/room/${targetRoom.toBase58()}`);
    } catch (err: unknown) {
      console.error('Quick Play error:', err);
      const msg = err instanceof Error ? err.message : 'Quick Play transaction failed';
      toast.error(msg);
    } finally {
      setIsQuickPlaying(false);
    }
  };

  // Create Room handler
  const handleCreateRoom = async () => {
    if (!wallet.publicKey) {
      toast.error('Connect your Solana wallet to create a room');
      return;
    }

    setIsCreating(true);
    try {
      let opponentPubkey: PublicKey | null = null;
      if (allowedOpponent.trim()) {
        try {
          opponentPubkey = new PublicKey(allowedOpponent.trim());
        } catch {
          toast.error('Invalid opponent Solana address');
          setIsCreating(false);
          return;
        }
      }

      const [myRoomPda] = getRoomPda(wallet.publicKey);
      const pdaStr = myRoomPda.toBase58();
      const code = `SD-${pdaStr.slice(0, 8).toUpperCase()}`;

      toast.info('Initializing MatchRoom PDA...');
      await program.methods
        .createRoom(selectedGame, selectedTier, opponentPubkey)
        .accounts({
          creator: wallet.publicKey,
        })
        .rpc();

      toast.success(`Room deployed! Code: ${code}`);
      router.push(`/room/${pdaStr}`);
    } catch (err: unknown) {
      console.error('Create room error:', err);
      const msg = err instanceof Error ? err.message : 'Room creation failed';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  // Join Room by Code handler
  const handleJoinByCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = joinCodeInput.trim();
    if (!raw) {
      toast.error('Please enter a room code or address');
      return;
    }

    setIsSearchingCode(true);
    try {
      // 1. Direct URL paste check
      const urlMatch = raw.match(/\/room\/([a-zA-Z0-9]{32,44})/);
      if (urlMatch) {
        router.push(`/room/${urlMatch[1]}`);
        return;
      }

      // 2. Direct PublicKey paste check
      try {
        const pk = new PublicKey(raw);
        router.push(`/room/${pk.toBase58()}`);
        return;
      } catch {}

      // 3. Short Code resolution (e.g. SD-8F9A2B or 8F9A2B)
      let clean = raw.toUpperCase();
      if (clean.startsWith('SD-')) clean = clean.slice(3);
      if (clean.startsWith('#')) clean = clean.slice(1);

      toast.info(`Resolving room code "${clean}"...`);
      const allRooms = await (program.account as any).matchRoom.all();

      const matchedRoom = allRooms.find((r: any) => {
        const pdaStr = r.publicKey.toBase58().toUpperCase();
        const creatorStr = r.account.creator ? r.account.creator.toBase58().toUpperCase() : '';
        return (
          pdaStr.startsWith(clean) ||
          pdaStr.endsWith(clean) ||
          creatorStr.startsWith(clean) ||
          creatorStr.endsWith(clean)
        );
      });

      if (matchedRoom) {
        toast.success(`Connected to room!`);
        router.push(`/room/${matchedRoom.publicKey.toBase58()}`);
        return;
      }

      toast.error(`Room code "${raw}" not found on devnet.`);
    } catch (err) {
      console.error('Join by code error:', err);
      toast.error('Failed to query on-chain rooms');
    } finally {
      setIsSearchingCode(false);
    }
  };

  return (
    <div className="w-full space-y-6 py-1 font-mono">
      {/* Sleek Minimal Top Command Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-emerald-500/20">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 tracking-wider">SOLDUEL</span>
            <span className="text-slate-600">//</span>
            <span className="text-slate-300">STAKED 1V1 MINIGAMES</span>
            <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.2 rounded font-normal">
              DEVNET
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Peer-to-peer on-chain duels. Instant PDA escrow settlement.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/play/${currentGame.slug}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:border-emerald-500/40 transition-all"
          >
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            <span>Practice Bots</span>
          </Link>
          <GetTestSolButton />
        </div>
      </div>

      {/* Main Cockpit Layout: 2 Clean Columns (7 cols / 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Game Module Selection & Stake */}
        <div className="lg:col-span-7 space-y-5">
          {/* 01 / SELECT GAME */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="text-emerald-400">01</span>
                <span>/</span>
                <span>Select Game</span>
              </span>
              <span className="text-[10px] text-slate-500">Hover to inspect rules</span>
            </div>

            {/* Split: Clean Game List on Left + Floating Rules HUD on Right */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
              {/* Game Cards Column (5 cols on md+) */}
              <div className="md:col-span-5 flex flex-col gap-2">
                {GAMES.map((game) => {
                  const isSelected = selectedGame === game.id;
                  const isHovered = hoveredGame === game.id;

                  return (
                    <button
                      key={game.id}
                      type="button"
                      onMouseEnter={() => setHoveredGame(game.id)}
                      onMouseLeave={() => setHoveredGame(null)}
                      onClick={() => setSelectedGame(game.id)}
                      className={`relative p-3 rounded-xl text-left transition-all cursor-pointer flex items-center justify-between border ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : isHovered
                            ? 'bg-[#0a1220] border-emerald-500/50'
                            : 'bg-[#080d16]/80 border-slate-850 hover:border-slate-750 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base select-none">{game.icon}</span>
                        <div>
                          <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                            {game.name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-normal">
                            {game.skill ? 'Skill · ELO' : 'Luck Duel'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">{game.clock}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Floating Rules Terminal Column (7 cols on md+) */}
              <div className="md:col-span-7 flex flex-col">
                <CyberRulesTerminal
                  gameId={activeInspectedGameId}
                  isHovered={hoveredGame !== null}
                />
              </div>
            </div>
          </div>

          {/* 02 / SELECT STAKE */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="text-emerald-400">02</span>
                <span>/</span>
                <span>Select Stake</span>
              </span>
              <span className="text-[10px] text-slate-500">1 Coin = 0.0001 SOL</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {STAKE_TIERS_COINS.map((coins, tierIdx) => {
                const solAmount = (coins * LAMPORTS_PER_COIN) / 1_000_000_000;
                const isSelected = selectedTier === tierIdx;
                const label = TIER_LABELS[tierIdx];

                return (
                  <button
                    key={tierIdx}
                    type="button"
                    onClick={() => setSelectedTier(tierIdx)}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/30 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                        : 'bg-[#080d16]/80 border-slate-850 hover:border-slate-750 text-slate-400'
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                    <div className="text-lg font-black text-white">
                      {coins} <span className="text-xs text-cyan-400 font-bold">Coins</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {solAmount} SOL
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Action Matchmaking Deck */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl hacker-panel border border-emerald-500/25 space-y-4">
            {/* 3-Pill Action Switcher */}
            <div className="grid grid-cols-3 gap-1 bg-[#05090f] p-1 rounded-lg border border-slate-850">
              <button
                type="button"
                onClick={() => setActiveTab('quick')}
                className={`py-1.5 text-xs font-semibold rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'quick'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Quick Play</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`py-1.5 text-xs font-semibold rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'create'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('join')}
                className={`py-1.5 text-xs font-semibold rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'join'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Key className="h-3.5 w-3.5" />
                <span>Join Code</span>
              </button>
            </div>

            {/* TAB 1: QUICK PLAY */}
            {activeTab === 'quick' && (
              <div className="space-y-4 pt-1">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Match instantly with an active challenger in <strong className="text-slate-200">{currentGame.name}</strong>, or open a 120s queue spot.
                </p>

                {/* Pot Preview Pill */}
                <div className="p-3 rounded-lg bg-[#05090f] border border-slate-800 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">YOUR STAKE</span>
                    <span className="text-slate-200 font-bold">{currentStakeSol} SOL</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-emerald-400 block font-semibold">POT TO WIN</span>
                    <span className="text-emerald-300 font-bold text-sm">
                      {totalPotCoins} Coins ({totalPotSol} SOL)
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black py-5 text-xs rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.35)] transition-all cursor-pointer tracking-wider"
                  disabled={isQuickPlaying}
                  onClick={handleQuickPlay}
                >
                  {isQuickPlaying ? 'FINDING CHALLENGER...' : `FIND MATCH · ${currentStakeSol} SOL`}
                </Button>
              </div>
            )}

            {/* TAB 2: CREATE ROOM */}
            {activeTab === 'create' && (
              <div className="space-y-4 pt-1">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Deploys an on-chain room and generates a short code (<code className="text-cyan-400">SD-XXXXXXXX</code>) to invite a challenger.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="opponent" className="text-[11px] text-slate-400">
                    Opponent Address (Optional)
                  </Label>
                  <Input
                    id="opponent"
                    placeholder="Leave blank for open duel, or paste wallet"
                    value={allowedOpponent}
                    onChange={(e) => setAllowedOpponent(e.target.value)}
                    className="font-mono text-xs bg-[#05090f] border-slate-800 text-slate-200 placeholder:text-slate-600 rounded py-2"
                  />
                </div>

                {/* Pot Preview Pill */}
                <div className="p-3 rounded-lg bg-[#05090f] border border-slate-800 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">DEPOSIT</span>
                    <span className="text-slate-200 font-bold">{currentStakeSol} SOL</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-cyan-400 block font-semibold">POT PRIZE</span>
                    <span className="text-cyan-300 font-bold text-sm">
                      {totalPotCoins} Coins ({totalPotSol} SOL)
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-black py-5 text-xs rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.35)] transition-all cursor-pointer tracking-wider"
                  disabled={isCreating}
                  onClick={handleCreateRoom}
                >
                  {isCreating ? 'CREATING ROOM...' : `CREATE ROOM & GET CODE · ${currentStakeSol} SOL`}
                </Button>
              </div>
            )}

            {/* TAB 3: JOIN BY CODE */}
            {activeTab === 'join' && (
              <form onSubmit={handleJoinByCode} className="space-y-4 pt-1">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter an 8-character room code or paste the room address to join.
                </p>

                <div className="relative">
                  <Input
                    id="joinCode"
                    placeholder="e.g. SD-8F9A2B or room PDA"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    className="font-mono text-xs uppercase bg-[#05090f] border-amber-500/40 text-amber-300 placeholder:text-slate-600 rounded py-2.5 pl-3 pr-9 tracking-wider"
                  />
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-amber-400/60 pointer-events-none" />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black py-5 text-xs rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.35)] transition-all cursor-pointer tracking-wider"
                  disabled={isSearchingCode || !joinCodeInput.trim()}
                >
                  {isSearchingCode ? 'RESOLVING ROOM...' : 'ENTER ROOM'}
                </Button>
              </form>
            )}
          </div>

          {/* Minimal Subtle Trust Bar */}
          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 text-center">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
            <span>Non-custodial PDA escrow · Verified Rust logic · 5s timeout protection</span>
          </div>
        </div>
      </div>
    </div>
  );
}
