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

export default function RoomPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const resolvedParams = use(params);
  const address = resolvedParams.address;
  const router = useRouter();
  const { program, wallet, connection } = useSolduelProgram();
  const { room, isLoading, refetch, roomPubkey } = useRoomAccount(address);

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
      await (program.methods as any)
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

      await (program.methods as any)
        .cancelRoom()
        .accounts({
          room: roomPubkey,
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
      await (program.methods as any)
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

      await (program.methods as any)
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
  const statusKey = currentRoom
    ? Object.keys(currentRoom.status)[0]?.toLowerCase() || 'open'
    : 'open';

  // If the room account is missing or closed without an authoritative terminal state,
  // display the not-found / closed screen.
  if (!currentRoom || (!room && statusKey !== 'finished' && statusKey !== 'cancelled')) {
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
  const registered = getGame(currentRoom.game as any);

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      {/* Top Bar Navigation */}
      <div className="flex justify-between items-center">
        <Link
          href="/"
          className="text-sm flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lobby
        </Link>
        <GetTestSolButton />
      </div>

      {/* Room Details Card */}
      <Card className="p-6 bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{gameName} Match</h2>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold uppercase ${
                  statusKey === 'active'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : statusKey === 'open'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {statusKey}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">
              Room PDA: {address.slice(0, 8)}...{address.slice(-8)}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {totalPotCoins} Coins Pot
            </div>
            <div className="text-xs text-neutral-500">
              Each staked: {tierCoins} Coins ({stakeSol} SOL)
            </div>
          </div>
        </div>

        {/* Players View */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl">
            <span className="text-xs text-neutral-500 uppercase font-semibold">Player 1 (Creator)</span>
            <div className="font-mono text-sm font-medium mt-1 truncate">
              {currentRoom.players[0].toBase58()}
            </div>
          </div>
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl">
            <span className="text-xs text-neutral-500 uppercase font-semibold">Player 2 (Challenger)</span>
            <div className="font-mono text-sm font-medium mt-1 truncate">
              {currentRoom.players[1].equals(PublicKey.default)
                ? 'Waiting for opponent...'
                : currentRoom.players[1].toBase58()}
            </div>
          </div>
        </div>

        {/* Status: OPEN -> Waiting for Opponent */}
        {statusKey === 'open' && (
          <div className="space-y-4 bg-amber-500/5 border border-amber-500/20 p-5 rounded-xl">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
              <Users className="h-4 w-4" />
              Waiting for an opponent to join...
            </div>
            <div className="flex gap-2">
              <Input readOnly value={shareUrl || address} className="font-mono text-xs" />
              <Button onClick={handleCopyLink} variant="outline" size="sm" className="flex items-center gap-1.5 shrink-0">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Share Link'}</span>
              </Button>
            </div>

            {/* If spectator / challenger: Join button for custom rooms, Quick Play guidance for quick play */}
            {!isCreator && currentRoom.isQuickPlay && (
              <div className="space-y-2 text-center py-2">
                <p className="text-xs text-neutral-500">
                  This room was created through Quick Play. Use Quick Play in the lobby with this game and tier to match with an available player.
                </p>
                <Button asChild className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-5">
                  <Link href={`/?tab=quick&game=${currentRoom.game}&tier=${currentRoom.tier}`}>
                    Find Match via Quick Play
                  </Link>
                </Button>
              </div>
            )}
            {!isCreator && !currentRoom.isQuickPlay && (
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-5"
                disabled={isJoining}
                onClick={handleJoin}
              >
                {isJoining ? 'Joining Match...' : `Join Match & Stake ${tierCoins} Coins (${stakeSol} SOL)`}
              </Button>
            )}

            {/* If creator: Cancel button */}
            {isCreator && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={isCancelling}
                onClick={handleCancel}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Room & Refund Stake'}
              </Button>
            )}
          </div>
        )}

        {/* Status: ACTIVE -> Gameplay & Timers */}
        {statusKey === 'active' && (
          <div className="space-y-6">
            {/* Timer bar */}
            <div className="flex justify-between items-center bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-500" />
                <span>Move Deadline:</span>
              </div>
              <div className="font-mono font-bold">
                {deadlineSecondsRemaining > 0 ? (
                  <span>{deadlineSecondsRemaining}s</span>
                ) : (
                  <span className="text-red-500">EXPIRED</span>
                )}
              </div>
            </div>

            {/* Timeout Claim Button */}
            {timeoutClaimable && isPlayer && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-2">
                <div className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  Opponent timed out! Grace period has passed.
                </div>
                <Button
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
                  disabled={isClaimingTimeout}
                  onClick={handleClaimTimeout}
                >
                  {isClaimingTimeout ? 'Claiming Victory...' : `Claim Timeout Win & Collect ${totalPotCoins} Coins`}
                </Button>
              </div>
            )}

            {/* Game Board Display */}
            {registered && registered.ui ? (
              <div className="p-4 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800">
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
              <div className="py-8 text-center text-sm text-neutral-500">
                Live board is active. Waiting for player actions...
              </div>
            )}
          </div>
        )}

        {/* Status: FINISHED */}
        {statusKey === 'finished' && (
          <div className="py-8 text-center space-y-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
            <Trophy className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Match Finished!</h3>
            <p className="text-sm text-neutral-500">
              The {totalPotCoins} coins pot has been paid out on-chain to the winner.
            </p>
            <Link href="/">
              <Button className="mt-2 bg-purple-600 hover:bg-purple-700 text-white">
                Back to SolDuel Lobby
              </Button>
            </Link>
          </div>
        )}

        {/* Status: CANCELLED */}
        {statusKey === 'cancelled' && (
          <div className="py-8 text-center space-y-4 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl p-6">
            <h3 className="text-lg font-bold">Room Cancelled</h3>
            <p className="text-sm text-neutral-500">Stakes have been refunded to the creator.</p>
            <Link href="/">
              <Button variant="outline" className="mt-2">
                Back to SolDuel Lobby
              </Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
