'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLeaderboard, getProfilePda, LeaderboardEntry } from '@/components/solduel/solduel-data-access';
import {
  Trophy,
  Flame,
  Swords,
  Medal,
  Sparkles,
  ArrowUpDown,
  ExternalLink,
  User,
  Loader2,
  Crown,
} from 'lucide-react';

/**
 * Global SolDuel Leaderboard displaying player Elo rankings, podium, and match records.
 */
export default function LeaderboardPage() {
  const { publicKey } = useWallet();
  const { data: leaderboard, isLoading, isError, error, refetch } = useLeaderboard();
  const [sortKey, setSortKey] = useState<'rating' | 'wins' | 'streak'>('rating');

  const myProfilePdaStr = useMemo(() => {
    if (!publicKey) return null;
    return getProfilePda(publicKey)[0].toBase58();
  }, [publicKey]);

  const myWalletStr = publicKey ? publicKey.toBase58() : null;

  const sortedList = [...(leaderboard || [])].sort((a, b) => {
    if (sortKey === 'rating') return b.rating - a.rating;
    if (sortKey === 'wins') return b.wins - a.wins;
    if (sortKey === 'streak') return b.bestStreak - a.bestStreak;
    return 0;
  });

  const top3 = sortedList.slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-7 h-7 text-amber-500" />
            <h1 className="text-3xl font-extrabold tracking-tight">SolDuel Leaderboard</h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Global rankings and top combatants on Solana Devnet
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Refresh
          </Button>

          {myWalletStr && (
            <Button size="sm" asChild variant="secondary" className="gap-1.5">
              <Link href={`/profile/${myWalletStr}`}>
                <User className="w-4 h-4 text-purple-500" /> My Profile
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isError && (
        <Card className="p-6 text-center border-dashed border-red-300 dark:border-red-900/50 space-y-2">
          <p className="text-sm text-destructive font-medium">
            Failed to load leaderboard data: {error instanceof Error ? error.message : 'Network error'}
          </p>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Retry
          </Button>
        </Card>
      )}

      {/* Podium for Top 3 */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* #2 Silver */}
          <Card className="border-neutral-200 dark:border-neutral-800 bg-gradient-to-b from-slate-100/60 to-transparent dark:from-slate-900/60 order-2 md:order-1 relative overflow-hidden">
            <div className="absolute top-2 right-2 text-2xl font-black text-slate-300 dark:text-slate-700">#2</div>
            <CardHeader className="p-5 pb-2 text-center items-center">
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 text-2xl border-2 border-slate-300 shadow-md">
                🥈
              </div>
              <CardTitle className="text-base font-bold mt-2 truncate max-w-[200px]">
                <Link href={`/profile/${top3[1].wallet}`} className="hover:underline">
                  {top3[1].shortAddress}
                </Link>
              </CardTitle>
              <CardDescription className="text-xs">
                {top3[1].rating} Elo · {top3[1].wins} Wins
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 text-center">
              <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                <span>Streak: {top3[1].bestStreak}</span>
                <span>·</span>
                <span>{top3[1].badgeCount} Badges</span>
              </div>
            </CardContent>
          </Card>

          {/* #1 Gold */}
          <Card className="border-amber-300/60 dark:border-amber-500/40 bg-gradient-to-b from-amber-100/40 via-amber-50/20 to-transparent dark:from-amber-950/30 order-1 md:order-2 md:-translate-y-2 relative overflow-hidden shadow-md">
            <div className="absolute top-2 right-2 text-3xl font-black text-amber-300 dark:text-amber-700">#1</div>
            <CardHeader className="p-6 pb-2 text-center items-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 text-3xl border-2 border-amber-400 shadow-lg shadow-amber-500/20">
                👑
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Crown className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-lg font-black truncate max-w-[200px]">
                  <Link href={`/profile/${top3[0].wallet}`} className="hover:underline text-amber-600 dark:text-amber-400">
                    {top3[0].shortAddress}
                  </Link>
                </CardTitle>
              </div>
              <CardDescription className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                {top3[0].rating} Elo · {top3[0].winRate}% Win Rate
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0 text-center space-y-3">
              <div className="flex items-center justify-center gap-3 text-xs text-neutral-500 font-medium">
                <span>{top3[0].wins} Wins</span>
                <span>·</span>
                <span className="text-orange-500 flex items-center gap-0.5">
                  <Flame className="w-3.5 h-3.5" /> {top3[0].bestStreak} Streak
                </span>
                <span>·</span>
                <span>{top3[0].badgeCount} Badges</span>
              </div>
              <Button size="sm" asChild variant="outline" className="w-full text-xs">
                <Link href={`/profile/${top3[0].wallet}`}>View Champion Profile</Link>
              </Button>
            </CardContent>
          </Card>

          {/* #3 Bronze */}
          <Card className="border-neutral-200 dark:border-neutral-800 bg-gradient-to-b from-amber-900/10 to-transparent order-3 relative overflow-hidden">
            <div className="absolute top-2 right-2 text-2xl font-black text-amber-700/30">#3</div>
            <CardHeader className="p-5 pb-2 text-center items-center">
              <div className="w-14 h-14 rounded-full bg-amber-900/20 flex items-center justify-center text-amber-700 text-2xl border-2 border-amber-600/40 shadow-md">
                🥉
              </div>
              <CardTitle className="text-base font-bold mt-2 truncate max-w-[200px]">
                <Link href={`/profile/${top3[2].wallet}`} className="hover:underline">
                  {top3[2].shortAddress}
                </Link>
              </CardTitle>
              <CardDescription className="text-xs">
                {top3[2].rating} Elo · {top3[2].wins} Wins
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 text-center">
              <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                <span>Streak: {top3[2].bestStreak}</span>
                <span>·</span>
                <span>{top3[2].badgeCount} Badges</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sorting Tabs & Filters */}
      <div className="flex items-center justify-between border-b dark:border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={sortKey === 'rating' ? 'default' : 'ghost'}
            className="text-xs gap-1.5"
            onClick={() => setSortKey('rating')}
          >
            <Trophy className="w-3.5 h-3.5 text-purple-400" /> Top Rating
          </Button>
          <Button
            size="sm"
            variant={sortKey === 'wins' ? 'default' : 'ghost'}
            className="text-xs gap-1.5"
            onClick={() => setSortKey('wins')}
          >
            <Swords className="w-3.5 h-3.5 text-emerald-400" /> Most Wins
          </Button>
          <Button
            size="sm"
            variant={sortKey === 'streak' ? 'default' : 'ghost'}
            className="text-xs gap-1.5"
            onClick={() => setSortKey('streak')}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" /> Best Streak
          </Button>
        </div>

        <span className="text-xs text-neutral-500 hidden sm:inline">
          {sortedList.length} combatants tracked
        </span>
      </div>

      {/* Leaderboard Table */}
      <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">SolDuel leaderboard</caption>
            <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500 uppercase border-b dark:border-neutral-800">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Player</th>
                <th className="py-3 px-4">Skill Rating</th>
                <th className="py-3 px-4">Record</th>
                <th className="py-3 px-4">Win Rate</th>
                <th className="py-3 px-4">Best Streak</th>
                <th className="py-3 px-4 text-center">Badges</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-neutral-800/80">
              {sortedList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-neutral-500">
                    No duels recorded yet on the devnet leaderboard. Be the first to play and rank up!
                  </td>
                </tr>
              ) : (
                sortedList.map((entry, idx) => {
                  const rank = idx + 1;
                  const isUser = myProfilePdaStr !== null && myProfilePdaStr === entry.profilePda;

                return (
                  <tr
                    key={entry.wallet}
                    className={`hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors ${
                      isUser ? 'bg-purple-50/50 dark:bg-purple-950/20' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-4 font-bold text-center">
                      {rank === 1 ? (
                        <span className="text-lg">🥇</span>
                      ) : rank === 2 ? (
                        <span className="text-lg">🥈</span>
                      ) : rank === 3 ? (
                        <span className="text-lg">🥉</span>
                      ) : (
                        <span className="text-neutral-500 font-mono text-xs">{rank}</span>
                      )}
                    </td>

                    {/* Player */}
                    <td className="py-3.5 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/profile/${entry.wallet}`}
                          className="hover:underline font-mono text-xs flex items-center gap-1.5"
                        >
                          {entry.shortAddress}
                        </Link>
                        {isUser && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 border-purple-500 text-purple-600">
                            You
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Rating */}
                    <td className="py-3.5 px-4 font-bold text-purple-600 dark:text-purple-400">
                      {entry.rating}
                    </td>

                    {/* Record */}
                    <td className="py-3.5 px-4 text-xs text-neutral-600 dark:text-neutral-400">
                      {entry.wins}W · {entry.losses}L · {entry.draws}D
                    </td>

                    {/* Win Rate */}
                    <td className="py-3.5 px-4 font-semibold text-xs">
                      {entry.winRate}%
                    </td>

                    {/* Streak */}
                    <td className="py-3.5 px-4 text-xs">
                      <span className="inline-flex items-center gap-1 text-orange-500 font-semibold">
                        <Flame className="w-3.5 h-3.5" /> {entry.bestStreak}
                      </span>
                    </td>

                    {/* Badges */}
                    <td className="py-3.5 px-4 text-center">
                      <Badge variant="secondary" className="text-xs gap-1 font-mono">
                        <Sparkles className="w-3 h-3 text-amber-500" /> {entry.badgeCount}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                          <Link href={`/profile/${entry.wallet}`}>Profile</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

