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
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

interface GameModule {
  id: number;
  slug: string;
  code: string;
  name: string;
  badge: string;
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
    badge: 'SKILL_INDEX // 60s_CLK',
    skill: true,
    desc: '7x6 tactical gravity grid. Align 4 tokens on-chain.',
    winCon: 'Horizontal, vertical, or diagonal 4-in-a-row.',
  },
  {
    id: 1,
    slug: 'word-chain',
    code: 'WORD_CHAIN.sh',
    name: 'Word Chain',
    badge: 'MERKLE_PROOF // 30s_CLK',
    skill: true,
    desc: 'Speed prefix chain validated against on-chain Merkle root.',
    winCon: 'Chain valid dictionary prefixes; 4 strikes forfeits.',
  },
  {
    id: 2,
    slug: 'rps',
    code: 'RPS_SHA256.hex',
    name: 'Rock Paper Scissors',
    badge: 'COMMIT_REVEAL // 60s_CLK',
    skill: false,
    desc: 'Best-of-3 duel with dual SHA-256 hash commit-reveal.',
    winCon: 'First to 2 round victories (max 5 tied draws).',
  },
  {
    id: 3,
    slug: 'dice',
    code: 'DICE_ENTROPY.dat',
    name: 'Dice Duel',
    badge: 'JOINT_ENTROPY // 60s_CLK',
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
 * featuring Quick Play matching, private room creation with room codes, and join-by-code.
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

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success(`Copied room code: ${code}`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4 font-mono">
      {/* Hacker Terminal Command Bar */}
      <div className="rounded-xl hacker-panel p-5 md:p-7 border border-emerald-500/30 text-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>KERNEL::STAKED_1V1_ARENA</span>
              <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                PDA_ESCROW: LOCKED
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black tracking-wider text-white">
              SOLDUEL <span className="text-emerald-400">// CYBER_ARENA</span>
            </h1>

            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              &gt; Provably fair peer-to-peer dueling engine on Solana. Both challengers lock stakes into an on-chain MatchRoom PDA; victorious game resolution triggers automated payout.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <GetTestSolButton />
          </div>
        </div>

        {/* Practice Sandbox Direct Access Bar */}
        <div className="mt-5 pt-4 border-t border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-emerald-300">SANDBOX_MODE:</strong> Run zero-stake simulation duels against autonomous bots offline.
            </span>
          </div>

          <Link
            href={`/play/${currentGame.slug}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 transition-all shadow-[0_0_8px_rgba(16,185,129,0.2)]"
          >
            <span>[ RUN_PRACTICE_BOT: {currentGame.name.toUpperCase()} ]</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* 1. Game Selection Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <Label className="font-bold tracking-wider text-emerald-400 flex items-center gap-2 uppercase">
            <span className="text-cyan-400">&gt;&gt;</span> [01] SELECT_GAME_MODULE
          </Label>
          <span className="text-[11px] text-slate-500">// ALL ARBITRATION EXECUTED ON-CHAIN</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {GAMES.map((game) => {
            const isSelected = selectedGame === game.id;
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => setSelectedGame(game.id)}
                className={`relative p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between min-h-[150px] ${
                  isSelected
                    ? 'bg-emerald-950/30 border-2 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.35)] scale-[1.01]'
                    : 'bg-[#080d16]/90 border border-slate-800 hover:border-emerald-500/40 text-slate-400'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-cyan-400 font-mono tracking-wider">{game.code}</span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                        game.skill
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {game.skill ? 'SKILL' : 'LUCK'}
                    </span>
                  </div>

                  <h3 className={`font-bold text-base tracking-wide ${isSelected ? 'text-white font-black' : 'text-slate-200'}`}>
                    {game.name}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{game.badge}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80">
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    &gt; {game.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Stake Tier Selector */}
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
                  <span className={`px-1.5 py-0.5 rounded font-bold ${
                    isSelected ? 'bg-cyan-400 text-slate-950' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {meta.label}
                  </span>
                </div>

                <div className="text-2xl font-black text-white tracking-wider mt-1">
                  {coins} <span className="text-cyan-400 text-lg font-bold">COINS</span>
                </div>
                <div className="text-xs font-mono font-medium text-slate-400 mt-0.5">
                  &gt; STAKE: {solAmount} SOL
                </div>
                <div className="text-[10px] text-emerald-400/90 mt-2 font-mono">
                  POT_PAYOUT: <strong>{coins * 2} COINS</strong> ({solAmount * 2} SOL)
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Action Mode Switcher: 3 TABS (Quick Play, Create Room, Join by Code) */}
      <div className="space-y-4">
        {/* Terminal Tab Switcher */}
        <div className="flex flex-wrap gap-2 border-b border-emerald-500/20 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`py-2 px-4 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'quick'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-400 hover:text-white bg-slate-900/60 border border-transparent'
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-emerald-400" />
            <span>[ 01 // ⚡ QUICK_MATCH ]</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`py-2 px-4 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'create'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-400 hover:text-white bg-slate-900/60 border border-transparent'
            }`}
          >
            <Plus className="h-3.5 w-3.5 text-cyan-400" />
            <span>[ 02 // ➕ CREATE_ROOM ]</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('join')}
            className={`py-2 px-4 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'join'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-400 hover:text-white bg-slate-900/60 border border-transparent'
            }`}
          >
            <Key className="h-3.5 w-3.5 text-amber-400" />
            <span>[ 03 // 🔑 JOIN_BY_CODE ]</span>
          </button>
        </div>

        {/* TAB 01: QUICK PLAY MATCHMAKING */}
        {activeTab === 'quick' && (
          <div className="p-6 rounded-xl hacker-panel border border-emerald-500/30 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-400" />
                  <span>ON_CHAIN_FIFO_MATCHMAKER</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                  &gt; Scans waiting spot PDA for <strong className="text-white">{currentGame.name}</strong> at <strong className="text-white">{currentStakeCoins} Coins</strong>. If empty, writes a 120-second open spot. If occupied, matches and locks duel.
                </p>
              </div>

              <div className="bg-[#05090f] border border-emerald-500/30 px-3.5 py-2.5 rounded text-right shrink-0">
                <span className="text-[10px] text-slate-500 block">TOTAL_POT_POOL</span>
                <span className="text-lg font-black text-emerald-300">{totalPotCoins} COINS</span>
                <span className="text-xs text-slate-400 block font-mono">({totalPotSol} SOL)</span>
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
          <div className="p-6 rounded-xl hacker-panel border border-cyan-500/30 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Plus className="h-4 w-4 text-cyan-400" />
                  <span>INITIALIZE_MATCHROOM_PDA</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                  &gt; Deploys an on-chain MatchRoom PDA. Generates a unique <strong>ROOM CODE</strong> that any opponent can enter to join your duel.
                </p>
              </div>

              <div className="bg-[#05090f] border border-cyan-500/30 px-3.5 py-2.5 rounded text-right shrink-0">
                <span className="text-[10px] text-slate-500 block">ESCROW_STAKE</span>
                <span className="text-lg font-black text-cyan-300">{currentStakeCoins} COINS</span>
                <span className="text-xs text-slate-400 block font-mono">({currentStakeSol} SOL)</span>
              </div>
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
          <div className="p-6 rounded-xl hacker-panel border border-amber-500/30 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Key className="h-4 w-4 text-amber-400" />
                  <span>JOIN_DUEL_BY_CODE</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                  &gt; Received a room code from a challenger? Enter the 8-character code or paste the room PDA to decrypt and enter the matchroom.
                </p>
              </div>

              <div className="bg-[#05090f] border border-amber-500/30 px-3.5 py-2.5 rounded text-right shrink-0">
                <span className="text-[10px] text-slate-500 block">HANDSHAKE_PROTOCOL</span>
                <span className="text-xs font-bold text-amber-300">CODE // PDA_LOOKUP</span>
              </div>
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

      {/* Trustless PDA Security Telemetry Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-emerald-500/20 text-xs">
        <div className="p-3.5 rounded bg-[#060a12] border border-emerald-500/20">
          <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1">
            <Lock className="h-3.5 w-3.5" />
            <span>01 // PDA_NON_CUSTODIAL</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Stakes escrowed directly in Anchor room PDA (`seeds: ["room", creator]`). No admin custody.
          </p>
        </div>

        <div className="p-3.5 rounded bg-[#060a12] border border-cyan-500/20">
          <div className="flex items-center gap-2 text-cyan-400 font-bold mb-1">
            <Cpu className="h-3.5 w-3.5" />
            <span>02 // DETERMINISTIC_RULES</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            All outcomes decided by Rust SBF logic. Merkle proofs &amp; SHA-256 commit-reveal ensure integrity.
          </p>
        </div>

        <div className="p-3.5 rounded bg-[#060a12] border border-amber-500/20">
          <div className="flex items-center gap-2 text-amber-400 font-bold mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span>03 // TIMEOUT_ARBITRATION</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Turn deadlines enforced on-chain. If an opponent stalls, claim immediate payout after 5s grace.
          </p>
        </div>
      </div>
    </div>
  );
}
