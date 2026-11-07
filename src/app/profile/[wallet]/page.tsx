'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useProfileAccount,
  useMintBadge,
  getProfilePda,
  BADGE_DEFINITIONS,
  BadgeInfo,
} from '@/components/solduel/solduel-data-access';
import {
  Trophy,
  Flame,
  Swords,
  Shield,
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
  Sparkles,
  Lock,
  Loader2,
  Medal,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Maps player Elo rating to visual skill rank tier information.
 */
function getRatingTier(rating: number): { title: string; color: string } {
  if (rating >= 1200) return { title: 'Grandmaster', color: 'text-purple-400 border-purple-500/50 bg-purple-500/10' };
  if (rating >= 1100) return { title: 'Master', color: 'text-blue-400 border-blue-500/50 bg-blue-500/10' };
  if (rating >= 1050) return { title: 'Challenger', color: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10' };
  if (rating >= 1000) return { title: 'Contender', color: 'text-amber-400 border-amber-500/50 bg-amber-500/10' };
  return { title: 'Novice', color: 'text-neutral-400 border-neutral-500/50 bg-neutral-500/10' };
}

/**
 * Player Profile page showing match record, streaks, badges, and on-chain NFT badge minting.
 */
export default function ProfilePage({ params }: { params: Promise<{ wallet: string }> }) {
  const resolvedParams = use(params);
  const targetWallet = resolvedParams.wallet;
  const { publicKey } = useWallet();
  const [copied, setCopied] = useState(false);
  const [mintingIndex, setMintingIndex] = useState<number | null>(null);

  const { profile, isLoading, refetch, walletPubkey } = useProfileAccount(targetWallet);
  const mintBadgeMutation = useMintBadge();

  const myProfilePda = publicKey ? getProfilePda(publicKey)[0].toBase58() : null;
  const isMe =
    publicKey !== null &&
    (publicKey.toBase58() === targetWallet || myProfilePda === targetWallet);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetWallet);
      setCopied(true);
      toast.success('Wallet address copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy address');
    }
  };

  const handleMint = async (badge: BadgeInfo) => {
    if (!isMe) {
      toast.error('You can only mint badges for your own connected wallet');
      return;
    }

    setMintingIndex(badge.index);
    try {
      await mintBadgeMutation.mutateAsync({ badgeIndex: badge.index });
      await refetch();
    } catch {
      // Error handled in mutation toast
    } finally {
      setMintingIndex(null);
    }
  };

  if (!walletPubkey) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
        <h1 className="text-xl font-bold">Invalid Wallet Address</h1>
        <p className="text-sm text-neutral-500">
          The address &quot;{targetWallet}&quot; is not a valid Solana public key.
        </p>
        <Button asChild size="sm">
          <Link href="/">Back to Lobby</Link>
        </Button>
      </div>
    );
  }

  const rating = profile?.rating || 1000;
  const wins = profile?.wins || 0;
  const losses = profile?.losses || 0;
  const draws = profile?.draws || 0;
  const totalGames = wins + losses + draws;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const streak = profile?.streak || 0;
  const bestStreak = profile?.bestStreak || 0;
  const badgesMask = profile?.badges || 0;

  const tierInfo = getRatingTier(rating);

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-4">
      {/* Back button & Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link href="/">
            <ArrowLeft className="w-4 h-4" /> Back to Lobby
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/leaderboard">
            <Medal className="w-4 h-4 text-amber-500" /> View Leaderboard
          </Link>
        </Button>
      </div>

      {/* Profile Header Banner */}
      <Card className="border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-neutral-50 via-white to-purple-50/40 dark:from-neutral-900 dark:via-neutral-900/90 dark:to-purple-950/20 shadow-md">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-purple-500/20">
                {targetWallet.slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-extrabold tracking-tight">
                    {targetWallet.slice(0, 4)}...{targetWallet.slice(-4)}
                  </h1>
                  {isMe && (
                    <Badge variant="outline" className="text-purple-600 border-purple-500/40 bg-purple-50 dark:bg-purple-950/40">
                      You
                    </Badge>
                  )}
                  {profile && (
                    <Badge variant="outline" className={tierInfo.color}>
                      {tierInfo.title}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500 font-mono">
                  <span>{targetWallet}</span>
                  <button
                    onClick={handleCopy}
                    className="hover:text-neutral-900 dark:hover:text-white transition-colors"
                    title="Copy address"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={`https://explorer.solana.com/address/${targetWallet}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-purple-500 transition-colors"
                    title="View on Solana Explorer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-stretch md:self-auto justify-end">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Refresh
              </Button>
              {!isMe && (
                <Button size="sm" asChild className="gap-1.5 bg-purple-600 hover:bg-purple-700">
                  <Link href={`/?opponent=${targetWallet}`}>
                    <Swords className="w-4 h-4" /> Challenge
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No Profile Alert */}
      {!isLoading && !profile && (
        <Card className="p-8 text-center border-dashed border-neutral-300 dark:border-neutral-800 space-y-3">
          <Shield className="w-10 h-10 text-neutral-400 mx-auto" />
          <h2 className="text-lg font-bold">No Duels Recorded Yet</h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            {isMe
              ? 'You have not joined or hosted any minigame duels yet. Enter a quick match or create a room to start earning Elo and badges!'
              : 'This player has not participated in any SolDuel matches on Devnet yet.'}
          </p>
          <div className="pt-2">
            <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700">
              <Link href={isMe ? '/' : `/?opponent=${targetWallet}`}>
                {isMe ? 'Play First Match' : 'Challenge to Duel'}
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Active Room Alert if in a duel */}
      {profile?.activeRoom && !profile.activeRoom.equals(PublicKey.default) && (
        <Card className="border-amber-500/40 bg-amber-500/10 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Swords className="w-5 h-5 text-amber-500 animate-pulse" />
              <div>
                <p className="font-semibold text-amber-600 dark:text-amber-400 text-sm">
                  Active Duel in Progress
                </p>
                <p className="text-xs text-neutral-500 font-mono">
                  Room: {profile.activeRoom.toBase58().slice(0, 8)}...{profile.activeRoom.toBase58().slice(-8)}
                </p>
              </div>
            </div>
            <Button size="sm" asChild className="bg-amber-600 hover:bg-amber-700 text-white">
              <Link href={`/room/${profile.activeRoom.toBase58()}`}>
                Go to Match Room
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards Grid - only shown if profile exists or is loading */}
      {(profile || isLoading) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Rating Card */}
          <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs flex items-center justify-between">
                <span>Skill Rating (Elo)</span>
                <Trophy className="w-4 h-4 text-purple-500" />
              </CardDescription>
              <CardTitle className="text-2xl font-black">{rating}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-neutral-500">Skill matches only</p>
            </CardContent>
          </Card>

          {/* Record & Win Rate */}
          <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs flex items-center justify-between">
                <span>Win Rate</span>
                <Shield className="w-4 h-4 text-emerald-500" />
              </CardDescription>
              <CardTitle className="text-2xl font-black">{winRate}%</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-neutral-500">
                {wins}W · {losses}L · {draws}D
              </p>
            </CardContent>
          </Card>

          {/* Current Streak */}
          <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs flex items-center justify-between">
                <span>Current Streak</span>
                <Flame className="w-4 h-4 text-orange-500" />
              </CardDescription>
              <CardTitle className="text-2xl font-black text-orange-500 flex items-center gap-1.5">
                {streak} <span className="text-xs font-normal text-neutral-400">wins</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-neutral-500">Consecutive victories</p>
            </CardContent>
          </Card>

          {/* Best Streak */}
          <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs flex items-center justify-between">
                <span>Best Streak</span>
                <Sparkles className="w-4 h-4 text-amber-500" />
              </CardDescription>
              <CardTitle className="text-2xl font-black">{bestStreak}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-neutral-500">All-time highest</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Badges Showcase Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">On-Chain Badges</h2>
            <p className="text-xs text-neutral-500">
              Non-transferable soulbound NFT achievements minted via Metaplex Core
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {BADGE_DEFINITIONS.filter((b) => (badgesMask & b.flag) !== 0).length} / 4 Unlocked
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BADGE_DEFINITIONS.map((badge) => {
            const isUnlocked = (badgesMask & badge.flag) !== 0;
            const isMinted = (badgesMask & badge.mintedFlag) !== 0;
            const isMinting = mintingIndex === badge.index;

            return (
              <Card
                key={badge.id}
                className={`transition-all border ${
                  isUnlocked
                    ? 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm'
                    : 'border-dashed border-neutral-200 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-950/40 opacity-70'
                }`}
              >
                <CardContent className="p-5 flex items-start gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border flex-shrink-0 bg-gradient-to-br ${
                      isUnlocked
                        ? badge.gradient
                        : 'from-neutral-200/50 to-neutral-300/50 dark:from-neutral-800/50 dark:to-neutral-900/50 border-neutral-300 dark:border-neutral-800 text-neutral-400 grayscale'
                    }`}
                  >
                    {badge.icon}
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm truncate">{badge.name}</h3>
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                          {badge.rarity}
                        </Badge>
                      </div>

                      {isMinted ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] gap-1">
                          <Sparkles className="w-3 h-3" /> Minted
                        </Badge>
                      ) : isUnlocked ? (
                        <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px]">
                          Unlocked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-neutral-400 text-[10px] gap-1">
                          <Lock className="w-3 h-3" /> Locked
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {badge.description}
                    </p>

                    <div className="pt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-neutral-500">
                        Goal: <span className="text-neutral-700 dark:text-neutral-300">{badge.requirement}</span>
                      </span>

                      {/* Mint Button for eligible user */}
                      {isUnlocked && !isMinted && isMe && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm"
                          onClick={() => handleMint(badge)}
                          disabled={isMinting}
                        >
                          {isMinting ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Minting...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 mr-1" /> Mint NFT
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
