import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, PROFILE_SEED } from '../src/config';
import {
  decodeProfileBuffer,
  calculateRatingChange,
  BADGE_FIRST_WIN,
  BADGE_3_WIN_STREAK,
  BADGE_WORD_MASTER,
  BADGE_HIGH_ROLLER,
  BADGE_MINTED_MASK_SHIFT,
  BADGE_DEFINITIONS,
} from '../src/components/solduel/profile-utils';

describe('Profiles & Badges Test Suite', () => {
  const testWallet = new PublicKey('11111111111111111111111111111112');

  it('correctly derives the profile PDA', () => {
    const [profilePda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(PROFILE_SEED), testWallet.toBuffer()],
      PROGRAM_ID
    );
    expect(profilePda).toBeDefined();
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(typeof bump).toBe('number');
  });

  it('correctly decodes profile data from fixed Rust-compatible binary fixture', () => {
    // 67-byte fixture matching Rust on-chain Profile layout:
    // 8 bytes discriminator
    // wins: 10 (0a 00 00 00)
    // losses: 2 (02 00 00 00)
    // draws: 1 (01 00 00 00)
    // rating: 1120 (60 04)
    // streak: 5 (05 00 00 00)
    // best_streak: 7 (07 00 00 00)
    // badges: 3 (First Win + 3-Win Streak) (03 00 00 00)
    // active_room: 32 zero bytes
    // bump: 254 (fe)
    const fixtureHex =
      '1122334455667788' +
      '0a000000' +
      '02000000' +
      '01000000' +
      '6004' +
      '05000000' +
      '07000000' +
      '03000000' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      'fe';

    const fixtureBytes = Uint8Array.from(Buffer.from(fixtureHex, 'hex'));
    expect(fixtureBytes.length).toBe(67);

    const decoded = decodeProfileBuffer(fixtureBytes);
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
    const normalDelta = calculateRatingChange(1000, 1000, false);
    expect(normalDelta).toBe(16);

    // Direct challenge match between 1000 and 1000 (halved delta)
    const directDelta = calculateRatingChange(1000, 1000, true);
    expect(directDelta).toBe(8);

    // Lower rated player beats higher rated player (underdog bonus)
    // 16 + (1200 - 1000) / 25 = 16 + 8 = 24
    const underdogDelta = calculateRatingChange(1000, 1200, false);
    expect(underdogDelta).toBe(24);

    // Clamped minimum delta
    const strongFavDelta = calculateRatingChange(1500, 1000, false);
    expect(strongFavDelta).toBe(4);
  });

  it('checks badge eligibility, definitions, and minted bitmask', () => {
    expect(BADGE_DEFINITIONS.length).toBe(4);
    expect(BADGE_DEFINITIONS[0].name).toBe('First Win');
    expect(BADGE_DEFINITIONS[1].name).toBe('3-Win Streak');
    expect(BADGE_DEFINITIONS[2].name).toBe('Word Master');
    expect(BADGE_DEFINITIONS[3].name).toBe('High Roller');

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
