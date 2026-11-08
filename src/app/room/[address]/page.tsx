'use client';

import { use, useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useSolduelProgram,
  useRoomAccount,
  getProfilePda,
  getWaitingSpotPda,
} from '@/components/solduel/solduel-data-access';
import { GetTestSolButton } from '@/components/solduel/get-test-sol-button';
import { STAKE_TIERS_COINS, LAMPORTS_PER_COIN, TIMEOUT_GRACE_SECS } from '@/config';
import { getGame } from '@/games';
import { GameKind } from '@/games/types';
import {
  ArrowLeft,
  Clock,
  Copy,
  Check,
  ShieldAlert,
  Swords,
  Trophy,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

const GAME_NAMES: Record<number, string> = {
  0: 'Connect Four',
  1: 'Word Chain',
  2: 'Rock Paper Scissors',
  3: 'Dice Duel',
};

const emptySubscribe = () => () => {};

/**
 * Match Room page subscribing to real-time on-chain game state, turns, and timeouts.
 */
export default function RoomPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const resolvedParams = use(params);
  const address = resolvedParams.address;
  const router = useRouter();
  const { program, wallet, connection } = useSolduelProgram();
  const { room, isLoading, isError, isAccountClosed, refetch, roomPubkey } = useRoomAccount(address);

  type RoomAccount = NonNullable<ReturnType<typeof useRoomAccount>['room']>;
  const [retainedRoom, setRetainedRoom] = useState<RoomAccount | null>(null);

  if (room && room !== retainedRoom) {
    setRetainedRoom(room);
  }

  const currentRoom = room ?? retainedRoom;

  const shareUrl = useSyncExternalStore(
    emptySubscribe,
    () => window.location.href,
    () => address
  );

  const [copied, setCopied] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isClaimingTimeout, setIsClaimingTimeout] = useState(false);
  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const [nowTs, setNowTs] = useState<number>(() => Math.floor(Date.now() / 1000));

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (!roomPubkey) return;
    const subId = connection.onAccountChange(
      roomPubkey,
      () => {
        refetch();
      },
      'confirmed'
    );
    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [roomPubkey, connection, refetch]);

  const isCreator = useMemo(() => {
    if (!wallet.publicKey || !currentRoom) return false;
    return currentRoom.creator.equals(wallet.publicKey);
  }, [wallet.publicKey, currentRoom]);

  const isPlayer = useMemo(() => {
    if (!wallet.publicKey || !currentRoom) return false;
    return (
      currentRoom.players[0].equals(wallet.publicKey) ||
      currentRoom.players[1].equals(wallet.publicKey)
    );
  }, [wallet.publicKey, currentRoom]);

  const myPlayerIdx = useMemo(() => {
    if (!wallet.publicKey || !currentRoom) return -1;
    if (currentRoom.players[0].equals(wallet.publicKey)) return 0;
    if (currentRoom.players[1].equals(wallet.publicKey)) return 1;
    return -1;
  }, [wallet.publicKey, currentRoom]);

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success('Room link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy room link');
    }
  };

  const handleJoin = async () => {
    if (!wallet.publicKey || !roomPubkey) {
      toast.error('Connect your wallet first');
      return;
    }

    setIsJoining(true);
    try {
      toast.info('Joining match...');
      await program.methods
        .joinRoom()
        .accounts({
          room: roomPubkey,
          player: wallet.publicKey,
        })
        .rpc();

      toast.success('Joined match! Game is now active.');
      refetch();
    } catch (err: unknown) {
      console.error('Join error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to join match';
      toast.error(msg);
    } finally {
      setIsJoining(false);
    }
  };

  const handleCancel = async () => {
    if (!wallet.publicKey || !roomPubkey) return;

    setIsCancelling(true);
    try {
      toast.info('Cancelling room and refunding stake...');
      
      const remainingAccounts = [];
      if (currentRoom?.isQuickPlay) {
        const [spotPda] = getWaitingSpotPda(currentRoom.game, currentRoom.tier);
        remainingAccounts.push({
          pubkey: spotPda,
          isSigner: false,
          isWritable: true,
        });
      }

      await program.methods
        .cancelRoom()
        .accounts({
          creator: wallet.publicKey,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();

      toast.success('Room cancelled! Stakes and rent refunded.');
      refetch();
    } catch (err: unknown) {
      console.error('Cancel error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to cancel room';
      toast.error(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleClaimTimeout = async () => {
    if (!wallet.publicKey || !roomPubkey || !currentRoom) return;

    setIsClaimingTimeout(true);
    try {
      const [p0ProfilePda] = getProfilePda(currentRoom.players[0]);
      const [p1ProfilePda] = getProfilePda(currentRoom.players[1]);

      toast.info('Claiming timeout victory...');
      await program.methods
        .claimTimeout()
        .accounts({
          room: roomPubkey,
          claimant: wallet.publicKey,
        })
        .remainingAccounts([
          { pubkey: currentRoom.players[0], isSigner: false, isWritable: true },
          { pubkey: currentRoom.players[1], isSigner: false, isWritable: true },
          { pubkey: p0ProfilePda, isSigner: false, isWritable: true },
          { pubkey: p1ProfilePda, isSigner: false, isWritable: true },
        ])
        .rpc();

      toast.success('Timeout claimed! Match settled.');
      refetch();
    } catch (err: unknown) {
      console.error('Claim timeout error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to claim timeout';
      toast.error(msg);
    } finally {
      setIsClaimingTimeout(false);
    }
  };

  const handleGameAction = async (data: Uint8Array) => {
    if (!wallet.publicKey || !roomPubkey || !currentRoom) return;

    setIsSubmittingMove(true);
    try {
      const [p0ProfilePda] = getProfilePda(currentRoom.players[0]);
      const [p1ProfilePda] = getProfilePda(currentRoom.players[1]);

      await program.methods
        .gameAction(Buffer.from(data))
        .accounts({
          room: roomPubkey,
          player: wallet.publicKey,
        })
        .remainingAccounts([
          { pubkey: currentRoom.players[0], isSigner: false, isWritable: true },
          { pubkey: currentRoom.players[1], isSigner: false, isWritable: true },
          { pubkey: p0ProfilePda, isSigner: false, isWritable: true },
          { pubkey: p1ProfilePda, isSigner: false, isWritable: true },
        ])
        .rpc();

      refetch();
    } catch (err: unknown) {
      console.error('Game action error:', err);
      const msg = err instanceof Error ? err.message : 'Move failed';
      toast.error(msg);
    } finally {
      setIsSubmittingMove(false);
    }
  };

  if (isLoading && !currentRoom) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Swords className="h-10 w-10 animate-bounce text-purple-600 dark:text-purple-400" />
        <p className="text-neutral-500">Loading on-chain match room...</p>
      </div>
    );
  }

  // Parse room status
  const rawStatus = currentRoom
    ? Object.keys(currentRoom.status)[0]?.toLowerCase() || 'open'
    : 'open';

  // Authoritatively transition closed rooms to their final terminal states
  const statusKey =
    isAccountClosed && rawStatus === 'active'
      ? 'finished'
      : isAccountClosed && rawStatus === 'open'
      ? 'cancelled'
      : rawStatus;

  // If the room account was never found or closed without a match snapshot,
  // display the not-found / closed screen.
  if (!currentRoom) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="text-2xl font-bold">Room Not Found or Closed</h2>
        <p className="text-neutral-500 text-sm">
          This match room either does not exist or has already finished and had its accounts closed.
        </p>
        <Link href="/">
          <Button variant="outline" className="mt-4">
            Back to SolDuel Lobby
          </Button>
        </Link>
      </div>
    );
  }

  const tierCoins = STAKE_TIERS_COINS[currentRoom.tier] ?? 100;
  const stakeSol = (tierCoins * LAMPORTS_PER_COIN) / 1_000_000_000;
  const totalPotCoins = tierCoins * 2;
  const gameName = GAME_NAMES[currentRoom.game] || 'Custom Minigame';

  const deadlineVal = Number(currentRoom.deadlineTs || 0);
  const deadlineSecondsRemaining = Math.max(0, deadlineVal - nowTs);
  const timeoutClaimable =
    statusKey === 'active' &&
    deadlineVal > 0 &&
    nowTs >= deadlineVal + TIMEOUT_GRACE_SECS;

  // Registered game engine/ui
  const registered =
    currentRoom.game in GameKind || (currentRoom.game >= 0 && currentRoom.game <= 3)
      ? getGame(currentRoom.game as GameKind)
      : undefined;

  const roomCode = `SD-${address.slice(0, 8).toUpperCase()}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4 font-mono">
      {/* Top Bar Navigation */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs font-bold flex items-center gap-1.5 text-slate-400 hover:text-emerald-400 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>&lt; RETURN_TO_LOBBY</span>
          </Link>
          {isError && currentRoom && (
            <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded font-mono animate-pulse">
              SIGNAL_RECONNECTING...
            </span>
          )}
        </div>
        <GetTestSolButton />
      </div>

      {/* Room Details Card */}
      <Card className="p-6 hacker-panel border border-emerald-500/30 space-y-6 text-slate-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">{gameName.toUpperCase()} MATCHROOM</h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                  statusKey === 'active'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : statusKey === 'open'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                STATUS::{statusKey}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
              <span>ROOM_CODE: <strong className="text-amber-400 font-bold">{roomCode}</strong></span>
              <span>•</span>
              <span title={address}>PDA: {address.slice(0, 6)}...{address.slice(-6)}</span>
            </div>
          </div>

          <div className="text-left sm:text-right bg-[#05090f] border border-slate-800 px-3.5 py-2 rounded">
            <div className="text-base font-black text-emerald-400">
              {totalPotCoins} COINS POT
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              STAKE: {tierCoins} COINS ({stakeSol} SOL)
            </div>
          </div>
        </div>

        {/* Players View */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 bg-[#05090f] border border-slate-800 rounded">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">// PLAYER_01 (HOST)</span>
            <div className="font-mono text-xs text-emerald-400 font-bold mt-1 truncate">
              {currentRoom.players[0].toBase58()}
            </div>
          </div>
          <div className="p-3 bg-[#05090f] border border-slate-800 rounded">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">// PLAYER_02 (CHALLENGER)</span>
            <div className="font-mono text-xs font-bold mt-1 truncate text-slate-300">
              {currentRoom.players[1].equals(PublicKey.default)
                ? 'WAITING_FOR_HANDSHAKE...'
                : currentRoom.players[1].toBase58()}
            </div>
          </div>
        </div>

        {/* Status: OPEN -> Waiting for Opponent */}
        {statusKey === 'open' && (
          <div className="space-y-4 bg-amber-950/20 border border-amber-500/30 p-5 rounded-xl font-mono">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>AWAITING_CHALLENGER_HANDSHAKE</span>
            </div>

            {/* Prominent Room Access Code Display Box */}
            <div className="p-4 rounded bg-[#05090f] border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">// ROOM ACCESS CODE</span>
                <span className="text-xl font-black text-amber-300 tracking-widest">{roomCode}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Share this code with your challenger to join</span>
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  toast.success(`Copied room code: ${roomCode}`);
                }}
                variant="outline"
                size="sm"
                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-bold cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                <span>COPY CODE</span>
              </Button>
            </div>

            {/* Direct Share Link */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold">// OR SHARE INVITE LINK</span>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="font-mono text-xs bg-[#05090f] border-slate-800 text-slate-300"
                />
                <Button onClick={handleCopyLink} variant="outline" size="sm" className="flex items-center gap-1.5 shrink-0 bg-slate-900 border-slate-700 text-xs font-bold cursor-pointer">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'COPIED' : 'COPY LINK'}</span>
                </Button>
              </div>
            </div>

            {/* If spectator / challenger: Join button for custom rooms, Quick Play guidance for quick play */}
            {!isCreator && currentRoom.isQuickPlay && (
              <div className="space-y-2 text-center py-2">
                <p className="text-xs text-slate-400">
                  // This room is queued in Quick Play. Match using the lobby Quick Match queue.
                </p>
                <Button asChild className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-5">
                  <Link href={`/?tab=quick&game=${currentRoom.game}&tier=${currentRoom.tier}`}>
                    [ FIND MATCH VIA QUICK PLAY ]
                  </Link>
                </Button>
              </div>
            )}
            {!isCreator && !currentRoom.isQuickPlay && (
              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-5 text-sm shadow-[0_0_15px_rgba(16,185,129,0.35)] cursor-pointer"
                disabled={isJoining}
                onClick={handleJoin}
              >
                {isJoining ? '[ JOINING_MATCH... ]' : `[ ACCEPT CHALLENGE & STAKE ${tierCoins} COINS (${stakeSol} SOL) ]`}
              </Button>
            )}

            {/* If creator: Cancel button */}
            {isCreator && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full text-xs font-bold"
                disabled={isCancelling}
                onClick={handleCancel}
              >
                {isCancelling ? 'CANCELLING_ROOM...' : '[ CANCEL ROOM & REFUND ESCROW ]'}
              </Button>
            )}
          </div>
        )}

        {/* Status: ACTIVE -> Gameplay & Timers */}
        {statusKey === 'active' && (
          <div className="space-y-6">
            {/* Timer bar */}
            <div className="flex justify-between items-center bg-[#05090f] border border-slate-800 p-3 rounded font-mono text-xs">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-400" />
                <span className="text-slate-400">// ACTION_DEADLINE:</span>
              </div>
              <div className="font-mono font-bold">
                {deadlineSecondsRemaining > 0 ? (
                  <span className="text-emerald-400">{deadlineSecondsRemaining}s REMAINING</span>
                ) : (
                  <span className="text-red-400 font-black animate-pulse">! CLOCK_EXPIRED !</span>
                )}
              </div>
            </div>

            {/* Timeout Claim Button */}
            {timeoutClaimable && isPlayer && (
              <div className="p-4 bg-red-950/30 border border-red-500/40 rounded space-y-2 font-mono">
                <div className="text-xs font-bold text-red-400 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  <span>OPPONENT_TIMEOUT_DETECTED // GRACE_PERIOD_ELAPSED</span>
                </div>
                <Button
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 text-xs tracking-wider"
                  disabled={isClaimingTimeout}
                  onClick={handleClaimTimeout}
                >
                  {isClaimingTimeout ? 'CLAIMING_SETTLEMENT...' : `[ CLAIM TIMEOUT VICTORY // COLLECT ${totalPotCoins} COINS ]`}
                </Button>
              </div>
            )}

            {/* Game Board Display */}
            {registered && registered.ui ? (
              <div className="p-4 bg-[#05090f]/90 rounded-xl border border-emerald-500/30 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <registered.ui.Board
                  state={registered.engine.decodeState(new Uint8Array(currentRoom.state))}
                  me={myPlayerIdx >= 0 ? (myPlayerIdx as 0 | 1) : 0}
                  onMove={(m) => {
                    if (myPlayerIdx >= 0) {
                      handleGameAction(registered.engine.encodeAction(m));
                    }
                  }}
                  disabled={isSubmittingMove || myPlayerIdx < 0}
                />
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 font-mono">
                &gt; LIVE_BOARD_ACTIVE // AWAITING_ACTIONS...
              </div>
            )}
          </div>
        )}

        {/* Status: FINISHED */}
        {statusKey === 'finished' && (
          <div className="space-y-6">
            <div className="py-8 text-center space-y-4 bg-emerald-950/20 border border-emerald-500/40 rounded-xl p-6 font-mono">
              <Trophy className="h-10 w-10 text-emerald-400 mx-auto" />
              <h3 className="text-lg font-black text-emerald-400 tracking-wider">DUEL_CONCLUDED // MATCH_FINISHED</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Match arbitrated on Solana. Escrow funds ({totalPotCoins} Coins) distributed to winner.
              </p>
              <Link href="/" className="inline-block mt-2">
                <Button className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-6 py-4 rounded">
                  [ RETURN_TO_LOBBY ]
                </Button>
              </Link>
            </div>

            {/* Final Duel Showdown & Board Snapshot */}
            {registered && registered.ui && currentRoom && (
              <div className="p-4 bg-[#05090f]/90 rounded-xl border border-emerald-500/30 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400/80 mb-3 text-center">
                  FINAL_DUEL_SHOWDOWN // RESOLVED_ON_CHAIN
                </div>
                <registered.ui.Board
                  state={registered.engine.decodeState(new Uint8Array(currentRoom.state))}
                  me={myPlayerIdx >= 0 ? (myPlayerIdx as 0 | 1) : 0}
                  onMove={() => {}}
                  disabled={true}
                />
              </div>
            )}
          </div>
        )}

        {/* Status: CANCELLED */}
        {statusKey === 'cancelled' && (
          <div className="py-8 text-center space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-6 font-mono">
            <h3 className="text-base font-bold text-slate-300">ROOM_CANCELLED // ESCROW_REFUNDED</h3>
            <p className="text-xs text-slate-500">Stakes have been refunded to the room creator.</p>
            <Link href="/" className="inline-block mt-2">
              <Button variant="outline" className="text-xs font-bold">
                [ RETURN_TO_LOBBY ]
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
