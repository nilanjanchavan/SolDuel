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
  Shield,
  Copy,
  Check,
  Search,
  ExternalLink,
  Cpu,
  Lock,
  Clock,
  Sparkles,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';

interface GameModule {
  id: number;
  slug: string;
  code: string;
  name: string;
  icon: string;
  badge: string;
  clock: string;
  skill: boolean;
  desc: string;
  winCon: string;
}

const GAMES: GameModule[] = [
  {
    id: 0,
    slug: 'connect-four',
    code: 'C4_MATRIX.bin',
    name: 'Connect Four',
    icon: '🔴',
    badge: 'SKILL // ELO GAIN',
    clock: '60s CLK',
    skill: true,
    desc: '7x6 tactical gravity grid. Align 4 tokens on-chain.',
    winCon: 'Horizontal, vertical, or diagonal 4-in-a-row.',
  },
  {
    id: 1,
    slug: 'word-chain',
    code: 'WORD_CHAIN.sh',
    name: 'Word Chain',
    icon: '🔤',
    badge: 'MERKLE PROOF 👑',
    clock: '30s CLK',
    skill: true,
    desc: 'Speed prefix chain validated against on-chain Merkle root.',
    winCon: 'Chain valid dictionary prefixes; 4 strikes forfeits.',
  },
  {
    id: 2,
    slug: 'rps',
    code: 'RPS_SHA256.hex',
    name: 'Rock Paper Scissors',
    icon: '✂️',
    badge: 'COMMIT-REVEAL',
    clock: '60s CLK',
    skill: false,
    desc: 'Best-of-3 duel with dual SHA-256 hash commit-reveal.',
    winCon: 'First to 2 round victories (max 5 tied draws).',
  },
  {
    id: 3,
    slug: 'dice',
    code: 'DICE_ENTROPY.dat',
    name: 'Dice Duel',
    icon: '🎲',
    badge: 'JOINT ENTROPY 👑',
    clock: '60s CLK',
    skill: false,
    desc: 'High-roller duel. Both secret salts derive roll seed.',
    winCon: 'High roll takes the pot; tie triggers replay.',
  },
];

const TIER_META = [
  { label: 'LVL_1: CASUAL', sub: 'Warm-up duel', code: 'TIER_100' },
  { label: 'LVL_2: CONTENDER', sub: 'Standard duel', code: 'TIER_300' },
  { label: 'LVL_3: HIGH_ROLLER', sub: 'Badge unlock 👑', code: 'TIER_500' },
];

/**
 * Main SolDuel Lobby component styled with an authentic tech/hacker terminal aesthetic,
 * featuring Quick Play matching, private room creation with room codes, join-by-code,
 * and an expansive cockpit layout with floating codeline rules on hover.
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
  const [createdRoomInfo, setCreatedRoomInfo] = useState<{ pda: string; code: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const currentGame = GAMES[selectedGame] || GAMES[0];
  const activeInspectedGameId = hoveredGame !== null ? hoveredGame : selectedGame;
  const currentStakeCoins = STAKE_TIERS_COINS[selectedTier] || 100;
  const currentStakeSol = (currentStakeCoins * LAMPORTS_PER_COIN) / 1_000_000_000;
  const totalPotCoins = currentStakeCoins * 2;
  const totalPotSol = (currentStakeSol * 2).toFixed(2);

  // Quick Play handler
  const handleQuickPlay = async () => {
    if (!wallet.publicKey) {
      toast.error('ERR: WALLET_NOT_CONNECTED // Connect your Solana wallet');
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
              toast.info('NOTICE: Active waiting room detected for this wallet. Entering room...');
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

      toast.info('QUEUE: Transmitting quick_play transaction...');
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

      toast.success('SYS: Matchroom confirmed on-chain!');
      router.push(`/room/${targetRoom.toBase58()}`);
    } catch (err: unknown) {
      console.error('Quick Play error:', err);
      const msg = err instanceof Error ? err.message : 'Quick Play transaction failed';
      toast.error(`ERR: ${msg}`);
    } finally {
      setIsQuickPlaying(false);
    }
  };

  // Create Room handler
  const handleCreateRoom = async () => {
    if (!wallet.publicKey) {
      toast.error('ERR: WALLET_NOT_CONNECTED // Connect your Solana wallet');
      return;
    }

    setIsCreating(true);
    try {
      let opponentPubkey: PublicKey | null = null;
      if (allowedOpponent.trim()) {
        try {
          opponentPubkey = new PublicKey(allowedOpponent.trim());
        } catch {
          toast.error('ERR: INVALID_PUBKEY // Opponent address is malformed');
          setIsCreating(false);
          return;
        }
      }

      const [myRoomPda] = getRoomPda(wallet.publicKey);
      const pdaStr = myRoomPda.toBase58();
      const code = `SD-${pdaStr.slice(0, 8).toUpperCase()}`;

      toast.info('DEPLOYING: Initializing MatchRoom PDA...');
      await program.methods
        .createRoom(selectedGame, selectedTier, opponentPubkey)
        .accounts({
          creator: wallet.publicKey,
        })
        .rpc();

      setCreatedRoomInfo({ pda: pdaStr, code });
      toast.success(`ROOM_DEPLOYED: Code ${code}`);
      router.push(`/room/${pdaStr}`);
    } catch (err: unknown) {
      console.error('Create room error:', err);
      const msg = err instanceof Error ? err.message : 'Room creation failed';
      toast.error(`ERR: ${msg}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Join Room by Code handler
  const handleJoinByCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = joinCodeInput.trim();
    if (!raw) {
      toast.error('INPUT_REQUIRED: Enter a room code or room address');
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

      toast.info(`SCANNING_CHAIN: Resolving room code "${clean}"...`);
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
        toast.success(`RESOLVED: Room ${matchedRoom.publicKey.toBase58().slice(0, 8)}... connected!`);
        router.push(`/room/${matchedRoom.publicKey.toBase58()}`);
        return;
      }

      toast.error(`ERR_NOT_FOUND: Room code "${raw}" does not match any active devnet room.`);
    } catch (err) {
      console.error('Join by code error:', err);
      toast.error('SCAN_FAILED: Could not query on-chain match rooms');
    } finally {
      setIsSearchingCode(false);
    }
  };

  return (
    <div className="w-full space-y-6 py-2 font-mono">
      {/* Top Cyber Command Center Hero Bar */}
      <div className="rounded-xl hacker-panel p-5 md:p-6 border border-emerald-500/30 text-slate-200">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-emerald-400 text-xs font-bold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>KERNEL::STAKED_1V1_ARENA</span>
              <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                PDA_ESCROW: LOCKED
              </span>
              <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded">
                ZERO_SERVER // ON-CHAIN
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black tracking-wider text-white">
              SOLDUEL <span className="text-emerald-400">// CYBER_ARENA</span>
            </h1>

            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              &gt; Provably fair peer-to-peer staked duels on Solana. Both challengers lock stakes into an on-chain MatchRoom PDA. Victorious game resolution triggers automated payout.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto shrink-0">
            <Link
              href={`/play/${currentGame.slug}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/50 hover:border-emerald-400 transition-all shadow-[0_0_10px_rgba(16,185,129,0.25)]"
            >
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>[ PRACTICE_BOTS ↗ ]</span>
            </Link>
            <GetTestSolButton />
          </div>
        </div>
      </div>

      {/* Main Dual-Column Cyber Cockpit (12 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 7 Cols (Game Selection, Floating Rules Terminal, Stake Selector) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 01: Minigame Selector & Floating Rules Terminal */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <Label className="font-bold tracking-wider text-emerald-400 flex items-center gap-2 uppercase">
                <span className="text-cyan-400">&gt;&gt;</span> [01] SELECT_GAME_MODULE
              </Label>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                // HOVER OVER ANY GAME TO STREAM RULES
              </span>
            </div>

            {/* Split layout: Clean Game Cards on Left + Floating Rules Terminal on Right */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
              {/* Game Cards Column (5 Cols on md+) */}
              <div className="md:col-span-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2.5">
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
                      className={`relative p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between border ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.35)] scale-[1.01]'
                          : isHovered
                            ? 'bg-[#0a1220] border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                            : 'bg-[#080d16]/90 border-slate-800 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base select-none">{game.icon}</span>
                          <div>
                            <h3
                              className={`font-black text-sm tracking-wide ${
                                isSelected ? 'text-white' : isHovered ? 'text-emerald-300' : 'text-slate-200'
                              }`}
                            >
                              {game.name}
                            </h3>
                            <span className="text-[10px] text-cyan-400 font-mono tracking-wider block">
                              {game.code}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border ${
                              game.skill
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}
                          >
                            {game.skill ? 'SKILL' : 'LUCK'}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">{game.clock}</span>
                        </div>
                      </div>

                      {/* Active indicator bar */}
                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-slate-500 font-mono">{game.badge}</span>
                        {isSelected ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            [ACTIVE]
                          </span>
                        ) : isHovered ? (
                          <span className="text-cyan-400 font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            [HOVER]
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono">[CLICK]</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Floating Rules Terminal Column (7 Cols on md+) */}
              <div className="md:col-span-7 flex flex-col">
                <CyberRulesTerminal
                  gameId={activeInspectedGameId}
                  isHovered={hoveredGame !== null}
                />
              </div>
            </div>
          </div>

          {/* Section 02: Stake Tier Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <Label className="font-bold tracking-wider text-emerald-400 flex items-center gap-2 uppercase">
                <span className="text-cyan-400">&gt;&gt;</span> [02] CONFIGURE_STAKE_TIER
              </Label>
              <span className="text-[11px] text-slate-500 font-mono">
                1 COIN = 100,000 LAMPORTS (0.0001 SOL)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {STAKE_TIERS_COINS.map((coins, tierIdx) => {
                const solAmount = (coins * LAMPORTS_PER_COIN) / 1_000_000_000;
                const meta = TIER_META[tierIdx] || TIER_META[0];
                const isSelected = selectedTier === tierIdx;

                return (
                  <button
                    key={tierIdx}
                    type="button"
                    onClick={() => setSelectedTier(tierIdx)}
                    className={`p-4 rounded-xl border text-center transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-cyan-950/30 border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)] scale-[1.01]'
                        : 'bg-[#080d16]/90 border border-slate-800 hover:border-cyan-500/40 text-slate-400'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1 text-[10px] text-slate-500 font-mono">
                      <span>{meta.code}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold ${
                          isSelected ? 'bg-cyan-400 text-slate-950' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <div className="text-2xl font-black text-white tracking-wider mt-1">
                      {coins} <span className="text-cyan-400 text-lg font-bold">COINS</span>
                    </div>
                    <div className="text-xs font-mono font-medium text-slate-400 mt-0.5">
                      &gt; STAKE: {solAmount} SOL
                    </div>
                    <div className="text-[10px] text-emerald-400/90 mt-2 font-mono font-semibold">
                      POT_PAYOUT: <strong>{coins * 2} COINS</strong> ({solAmount * 2} SOL)
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: 5 Cols (Action Deck, Pot Telemetry, Protocol Security) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Action Mode Switcher: 3 TABS (Quick Play, Create Room, Join by Code) */}
          <div className="space-y-4">
            {/* Terminal Tab Switcher */}
            <div className="flex flex-wrap gap-2 border-b border-emerald-500/20 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('quick')}
                className={`py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'quick'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'text-slate-400 hover:text-white bg-slate-900/60 border border-transparent'
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                <span>[ ⚡ QUICK_MATCH ]</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'create'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'text-slate-400 hover:text-white bg-slate-900/60 border border-transparent'
                }`}
              >
                <Plus className="h-3.5 w-3.5 text-cyan-400" />
                <span>[ ➕ CREATE_ROOM ]</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('join')}
                className={`py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'join'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'text-slate-400 hover:text-white bg-slate-900/60 border border-transparent'
                }`}
              >
                <Key className="h-3.5 w-3.5 text-amber-400" />
                <span>[ 🔑 JOIN_BY_CODE ]</span>
              </button>
            </div>

            {/* TAB 01: QUICK PLAY MATCHMAKING */}
            {activeTab === 'quick' && (
              <div className="p-5 md:p-6 rounded-xl hacker-panel border border-emerald-500/30 space-y-5">
                <div className="space-y-1.5 pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-400" />
                      <span>ON_CHAIN_FIFO_MATCHMAKER</span>
                    </h3>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                      FIFO_QUEUE
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    &gt; Pairs you with any active waiting challenger in <strong className="text-white">{currentGame.name}</strong> at <strong className="text-white">{currentStakeCoins} Coins</strong> ({currentStakeSol} SOL), or creates an open 120s waiting spot.
                  </p>
                </div>

                {/* Pot Payout Telemetry Box */}
                <div className="p-3.5 rounded-lg bg-[#05090f] border border-emerald-500/30 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>YOUR_STAKE:</span>
                    <span className="text-white font-bold">{currentStakeCoins} COINS ({currentStakeSol} SOL)</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>OPPONENT_STAKE:</span>
                    <span className="text-white font-bold">{currentStakeCoins} COINS ({currentStakeSol} SOL)</span>
                  </div>
                  <div className="pt-2 border-t border-slate-850 flex justify-between items-center text-emerald-300 font-bold">
                    <span>WINNER_POT_PAYOUT:</span>
                    <span className="text-base text-emerald-400">{totalPotCoins} COINS ({totalPotSol} SOL)</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black py-6 text-sm rounded shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all cursor-pointer tracking-wider"
                  disabled={isQuickPlaying}
                  onClick={handleQuickPlay}
                >
                  {isQuickPlaying ? (
                    <span>&gt;&gt; EXECUTING_QUICK_PLAY_RPC...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <span>[ EXECUTE QUICK_MATCH // STAKE {currentStakeSol} SOL ]</span>
                    </span>
                  )}
                </Button>
              </div>
            )}

            {/* TAB 02: CREATE PRIVATE ROOM */}
            {activeTab === 'create' && (
              <div className="p-5 md:p-6 rounded-xl hacker-panel border border-cyan-500/30 space-y-5">
                <div className="space-y-1.5 pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      <Plus className="h-4 w-4 text-cyan-400" />
                      <span>INITIALIZE_MATCHROOM_PDA</span>
                    </h3>
                    <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded font-bold">
                      INVITE_CODE
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    &gt; Deploys an on-chain MatchRoom PDA. Generates a unique <strong>ROOM CODE</strong> that any opponent can enter to join your duel.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="opponent" className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                    <span>&gt; RESTRICT_TO_OPPONENT_PUBKEY</span>
                    <span className="text-[10px] text-slate-500">(OPTIONAL // LEAVE BLANK FOR OPEN DUEL)</span>
                  </Label>
                  <Input
                    id="opponent"
                    placeholder="Enter base58 Solana address to whitelist specific challenger"
                    value={allowedOpponent}
                    onChange={(e) => setAllowedOpponent(e.target.value)}
                    className="font-mono text-xs bg-[#05090f] border-slate-800 text-slate-200 placeholder:text-slate-600 rounded py-2.5 focus:border-cyan-500"
                  />
                </div>

                {/* Pot Payout Telemetry Box */}
                <div className="p-3.5 rounded-lg bg-[#05090f] border border-cyan-500/30 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>ESCROW_DEPOSIT:</span>
                    <span className="text-white font-bold">{currentStakeCoins} COINS ({currentStakeSol} SOL)</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>ROOM_CODE_FORMAT:</span>
                    <span className="text-cyan-400 font-mono font-bold">SD-XXXXXXXX</span>
                  </div>
                  <div className="pt-2 border-t border-slate-850 flex justify-between items-center text-cyan-300 font-bold">
                    <span>WINNER_POT_PAYOUT:</span>
                    <span className="text-base text-cyan-400">{totalPotCoins} COINS ({totalPotSol} SOL)</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-black py-6 text-sm rounded shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all cursor-pointer tracking-wider"
                  disabled={isCreating}
                  onClick={handleCreateRoom}
                >
                  {isCreating ? (
                    <span>&gt;&gt; DEPLOYING_MATCHROOM_PDA...</span>
                  ) : (
                    <span>[ DEPLOY_ROOM &amp; GENERATE_CODE // STAKE {currentStakeSol} SOL ]</span>
                  )}
                </Button>
              </div>
            )}

            {/* TAB 03: JOIN BY ROOM CODE */}
            {activeTab === 'join' && (
              <div className="p-5 md:p-6 rounded-xl hacker-panel border border-amber-500/30 space-y-5">
                <div className="space-y-1.5 pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      <Key className="h-4 w-4 text-amber-400" />
                      <span>JOIN_DUEL_BY_CODE</span>
                    </h3>
                    <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">
                      RESOLVER
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    &gt; Received a room code from a challenger? Enter the 8-character code or paste the room PDA to decrypt and enter the matchroom.
                  </p>
                </div>

                <form onSubmit={handleJoinByCode} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="joinCode" className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <span>&gt; ENTER_ROOM_CODE_OR_ADDRESS:</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="joinCode"
                        placeholder="e.g. SD-8F9A2B or full room PDA"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value)}
                        className="font-mono text-sm uppercase bg-[#05090f] border-amber-500/40 text-amber-300 placeholder:text-slate-600 rounded py-3 tracking-widest pl-3 pr-10 focus:border-amber-400"
                      />
                      <Search className="absolute right-3 top-3 h-4 w-4 text-amber-400/60 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Accepts room codes formatted like <code className="text-amber-400">SD-XXXXXXXX</code>, raw codes, or full base58 room addresses.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black py-6 text-sm rounded shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all cursor-pointer tracking-wider"
                    disabled={isSearchingCode || !joinCodeInput.trim()}
                  >
                    {isSearchingCode ? (
                      <span>&gt;&gt; RESOLVING_CODE_ON_CHAIN...</span>
                    ) : (
                      <span>[ DECRYPT_CODE &amp; ENTER_ROOM ]</span>
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>

          {/* Trustless PDA Security Telemetry Panel */}
          <div className="p-4 rounded-xl hacker-panel border border-emerald-500/20 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-bold border-b border-emerald-500/20 pb-2">
              <Shield className="h-4 w-4" />
              <span>ON_CHAIN_SECURITY_GUARANTEES</span>
            </div>

            <div className="space-y-2.5 text-[11px]">
              <div className="flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-slate-400 leading-relaxed">
                  <strong className="text-slate-200">PDA Escrow:</strong> Stakes held in on-chain MatchRoom PDA (<code className="text-cyan-400">seeds: [&quot;room&quot;, creator]</code>). 0% platform custody.
                </p>
              </div>

              <div className="flex items-start gap-2">
                <Cpu className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <p className="text-slate-400 leading-relaxed">
                  <strong className="text-slate-200">Deterministic Engine:</strong> Game state transition and win arbitration validated inside Solana SBF runtime.
                </p>
              </div>

              <div className="flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-slate-400 leading-relaxed">
                  <strong className="text-slate-200">Anti-Stall Timeout:</strong> Strict turn deadlines. If an opponent stalls, claim immediate payout with 5s grace.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
