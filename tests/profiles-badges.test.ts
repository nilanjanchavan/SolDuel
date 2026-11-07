import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '../src/config';

export const PROFILE_SEED = Buffer.from('profile');
export const BADGE_FIRST_WIN = 1 << 0;
export const BADGE_3_WIN_STREAK = 1 << 1;
export const BADGE_WORD_MASTER = 1 << 2;
export const BADGE_HIGH_ROLLER = 1 << 3;
export const BADGE_MINTED_MASK_SHIFT = 16;

export interface ProfileData {
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

export function decodeProfile(data: Uint8Array): ProfileData {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    wins: view.getUint32(8, true),
    losses: view.getUint32(12, true),
    draws: view.getUint32(16, true),
    rating: view.getUint16(20, true),
    streak: view.getUint32(22, true),
    bestStreak: view.getUint32(26, true),
    badges: view.getUint32(30, true),
    activeRoom: new PublicKey(data.slice(34, 66)),
    bump: data[66],
  };
}

export function encodeProfile(p: ProfileData): Uint8Array {
  const buf = new Uint8Array(67);
  const view = new DataView(buf.buffer);
  // Fake 8-byte discriminator
  for (let i = 0; i < 8; i++) buf[i] = 1;
  view.setUint32(8, p.wins, true);
  view.setUint32(12, p.losses, true);
  view.setUint32(16, p.draws, true);
  view.setUint16(20, p.rating, true);
  view.setUint32(22, p.streak, true);
  view.setUint32(26, p.bestStreak, true);
  view.setUint32(30, p.badges, true);
  buf.set(p.activeRoom.toBytes(), 34);
  buf[66] = p.bump;
  return buf;
}

export function calculateRatingChange(
  winnerRating: number,
  loserRating: number,
  isDirectChallenge: boolean
): { winnerNewRating: number; loserNewRating: number; delta: number } {
  const diff = Math.floor((loserRating - winnerRating) / 25);
  let change = Math.max(4, Math.min(32, 16 + diff));
  if (isDirectChallenge) {
    change = Math.max(2, Math.floor(change / 2));
  }
  return {
    winnerNewRating: winnerRating + change,
    loserNewRating: Math.max(0, loserRating - change),
    delta: change,
  };
}

describe('Profiles & Badges Test Suite', () => {
  const testWallet = new PublicKey('11111111111111111111111111111112');

  it('correctly derives the profile PDA', () => {
    const [profilePda, bump] = PublicKey.findProgramAddressSync(
      [PROFILE_SEED, testWallet.toBuffer()],
      PROGRAM_ID
    );
    expect(profilePda).toBeDefined();
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it('correctly decodes and encodes profile data matching Rust layout', () => {
    const profile: ProfileData = {
      wins: 10,
      losses: 2,
      draws: 1,
      rating: 1120,
      streak: 5,
      bestStreak: 7,
      badges: BADGE_FIRST_WIN | BADGE_3_WIN_STREAK,
      activeRoom: PublicKey.default,
      bump: 254,
    };

    const encoded = encodeProfile(profile);
    expect(encoded.length).toBe(67);

    const decoded = decodeProfile(encoded);
    expect(decoded.wins).toBe(10);
    expect(decoded.losses).toBe(2);
    expect(decoded.draws).toBe(1);
    expect(decoded.rating).toBe(1120);
    expect(decoded.streak).toBe(5);
    expect(decoded.bestStreak).toBe(7);
    expect(decoded.badges & BADGE_FIRST_WIN).not.toBe(0);
    expect(decoded.badges & BADGE_3_WIN_STREAK).not.toBe(0);
    expect(decoded.badges & BADGE_WORD_MASTER).toBe(0);
    expect(decoded.badges & BADGE_HIGH_ROLLER).toBe(0);
    expect(decoded.activeRoom.equals(PublicKey.default)).toBe(true);
    expect(decoded.bump).toBe(254);
  });

  it('verifies integer Elo rating math and smaller gains against same/direct opponent', () => {
    // Normal match between 1000 and 1000
    const normal = calculateRatingChange(1000, 1000, false);
    expect(normal.delta).toBe(16);
    expect(normal.winnerNewRating).toBe(1016);
    expect(normal.loserNewRating).toBe(984);

    // Direct challenge match between 1000 and 1000 (halved delta)
    const direct = calculateRatingChange(1000, 1000, true);
    expect(direct.delta).toBe(8);
    expect(direct.winnerNewRating).toBe(1008);
    expect(direct.loserNewRating).toBe(992);

    // Lower rated player beats higher rated player (underdog bonus)
    const underdog = calculateRatingChange(1000, 1200, false);
    expect(underdog.delta).toBe(24); // 16 + (1200-1000)/25 = 16 + 8 = 24
    expect(underdog.winnerNewRating).toBe(1024);
    expect(underdog.loserNewRating).toBe(1176);

    // Clamped minimum delta
    const strongFav = calculateRatingChange(1500, 1000, false);
    expect(strongFav.delta).toBe(4); // clamped to min 4
  });

  it('checks badge eligibility and minted bitmask', () => {
    let badges = 0;

    // First win earned
    badges |= BADGE_FIRST_WIN;
    expect(badges & BADGE_FIRST_WIN).not.toBe(0);

    // Minted badge 0
    const mintedBadge0 = 1 << (BADGE_MINTED_MASK_SHIFT + 0);
    expect(badges & mintedBadge0).toBe(0); // not yet minted

    badges |= mintedBadge0;
    expect(badges & mintedBadge0).not.toBe(0); // now minted

    // Badge 2 (Word Master) not earned
    expect(badges & BADGE_WORD_MASTER).toBe(0);
  });
});
