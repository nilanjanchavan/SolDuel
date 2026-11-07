import { PublicKey } from '@solana/web3.js';

/**
 * Metaplex Core program ID on Solana Devnet/Mainnet.
 */
export const MPL_CORE_PROGRAM_ID = new PublicKey(
  'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'
);

/**
 * Badge flag for winning first match (Bit 0).
 */
export const BADGE_FIRST_WIN = 1 << 0;

/**
 * Badge flag for achieving 3-win streak (Bit 1).
 */
export const BADGE_3_WIN_STREAK = 1 << 1;

/**
 * Badge flag for winning Word Chain with 0 strikes (Bit 2).
 */
export const BADGE_WORD_MASTER = 1 << 2;

/**
 * Badge flag for winning at tier 2 (500 coins) (Bit 3).
 */
export const BADGE_HIGH_ROLLER = 1 << 3;

/**
 * Bit shift offset for minted badges in profile.badges bitmask (bits 16..19).
 */
export const BADGE_MINTED_MASK_SHIFT = 16;

/**
 * Information describing an on-chain achievement badge.
 */
export interface BadgeInfo {
  index: number;
  id: string;
  name: string;
  description: string;
  requirement: string;
  flag: number;
  mintedFlag: number;
  icon: string;
  gradient: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
}

/**
 * Predefined list of the four core SolDuel soulbound achievement badges.
 */
export const BADGE_DEFINITIONS: BadgeInfo[] = [
  {
    index: 0,
    id: 'first_win',
    name: 'First Win',
    description: 'Claimed your very first victory in competitive minigame duels.',
    requirement: 'Win 1 match of any minigame',
    flag: BADGE_FIRST_WIN,
    mintedFlag: 1 << (BADGE_MINTED_MASK_SHIFT + 0),
    icon: '🏆',
    gradient: 'from-amber-500/20 to-yellow-500/20 border-amber-500/40 text-amber-500',
    rarity: 'Common',
  },
  {
    index: 1,
    id: '3_win_streak',
    name: '3-Win Streak',
    description: 'Relentless combat form with three consecutive victories.',
    requirement: 'Achieve a winning streak of 3 matches',
    flag: BADGE_3_WIN_STREAK,
    mintedFlag: 1 << (BADGE_MINTED_MASK_SHIFT + 1),
    icon: '🔥',
    gradient: 'from-orange-500/20 to-red-500/20 border-orange-500/40 text-orange-500',
    rarity: 'Rare',
  },
  {
    index: 2,
    id: 'word_master',
    name: 'Word Master',
    description: 'Impeccable vocabulary precision under extreme time pressure.',
    requirement: 'Win Word Chain with 0 strikes',
    flag: BADGE_WORD_MASTER,
    mintedFlag: 1 << (BADGE_MINTED_MASK_SHIFT + 2),
    icon: '⚡',
    gradient: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-400',
    rarity: 'Epic',
  },
  {
    index: 3,
    id: 'high_roller',
    name: 'High Roller',
    description: 'Dared to wager at the maximum tier and emerged victorious.',
    requirement: 'Win a duel in Tier 2 (500 coins stake)',
    flag: BADGE_HIGH_ROLLER,
    mintedFlag: 1 << (BADGE_MINTED_MASK_SHIFT + 3),
    icon: '👑',
    gradient: 'from-purple-500/20 to-pink-500/20 border-purple-500/40 text-purple-400',
    rarity: 'Legendary',
  },
];

/**
 * Deserialized representation of the SolDuel on-chain Profile account.
 */
export interface ProfileAccountData {
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  streak: number;
  bestStreak: number;
  badges: number;
  activeRoom: PublicKey;
  bump: number;
}

/**
 * Anchor 8-byte discriminator for the Profile account type (`account:Profile`).
 */
export const PROFILE_DISCRIMINATOR = new Uint8Array([184, 101, 165, 188, 95, 63, 127, 188]);

/**
 * Validates whether an account buffer starts with the canonical 8-byte Profile discriminator.
 */
export function hasProfileDiscriminator(data: Uint8Array): boolean {
  if (!data || data.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== PROFILE_DISCRIMINATOR[i]) return false;
  }
  return true;
}

/**
 * Decodes raw binary buffer of a Profile account matching the Anchor layout.
 *
 * @param data Byte slice containing 8-byte discriminator + profile fields (67 bytes total)
 * @returns Deserialized ProfileAccountData
 */
export function decodeProfileBuffer(data: Uint8Array): ProfileAccountData {
  if (!data || data.length < 67) {
    throw new Error(
      `Profile buffer too short: expected at least 67 bytes, got ${data?.length || 0}`
    );
  }
  if (!hasProfileDiscriminator(data)) {
    throw new Error('Invalid Profile account discriminator');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    wins: view.getUint32(8, true),
    losses: view.getUint32(12, true),
    draws: view.getUint32(16, true),
    rating: view.getUint16(20, true),
    streak: view.getUint32(22, true),
    bestStreak: view.getUint32(26, true),
    badges: view.getUint32(30, true),
    activeRoom: new PublicKey(data.subarray(34, 66)),
    bump: data[66] || 0,
  };
}

/**
 * Computes integer Elo rating change for skill matches, matching the Rust profile logic.
 *
 * @param winnerRating Winner's rating prior to the match
 * @param loserRating Loser's rating prior to the match
 * @param isDirectChallenge Whether the match was a direct challenge with allowed_opponent
 * @returns Rating points gained by winner and deducted from loser
 */
export function calculateRatingChange(
  winnerRating: number,
  loserRating: number,
  isDirectChallenge: boolean
): number {
  let delta: number;
  if (winnerRating >= loserRating) {
    const advantage = winnerRating - loserRating;
    const discount = Math.floor(advantage / 25);
    delta = 16 > discount ? 16 - discount : 4;
    if (delta < 4) delta = 4;
  } else {
    const deficit = loserRating - winnerRating;
    const boost = Math.floor(deficit / 25);
    delta = 16 + boost;
    if (delta > 32) delta = 32;
  }

  if (isDirectChallenge) {
    delta = Math.floor(delta / 2);
    if (delta < 2) delta = 2;
  }

  return delta;
}
