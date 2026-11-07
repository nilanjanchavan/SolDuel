import { PublicKey } from '@solana/web3.js';
import idl from '../anchor/src/idl/solduel.json';
import {
  PROGRAM_ID,
  LAMPORTS_PER_COIN,
  STAKE_TIERS,
  CONNECT_FOUR_TIMEOUT_SECS,
  WORD_CHAIN_TIMEOUT_SECS,
  COMMIT_REVEAL_TIMEOUT_SECS,
  TIMEOUT_GRACE_SECS,
  QUICK_PLAY_EXPIRY_SECS,
  PRIVATE_ROOM_EXPIRY_SECS,
  ROOM_SEED,
  PROFILE_SEED,
  WAITING_SPOT_SEED,
  GAME_STATE_BUFFER_SIZE,
} from '../src/config';

describe('Room Lifecycle & Protocol Rules', () => {
  it('has consistent global constants matching AGENTS.md', () => {
    expect(LAMPORTS_PER_COIN).toBe(100_000);
    expect(STAKE_TIERS).toEqual([100, 300, 500]);
    expect(STAKE_TIERS[0] * LAMPORTS_PER_COIN).toBe(10_000_000);
    expect(STAKE_TIERS[1] * LAMPORTS_PER_COIN).toBe(30_000_000);
    expect(STAKE_TIERS[2] * LAMPORTS_PER_COIN).toBe(50_000_000);

    expect(CONNECT_FOUR_TIMEOUT_SECS).toBe(60);
    expect(WORD_CHAIN_TIMEOUT_SECS).toBe(30);
    expect(COMMIT_REVEAL_TIMEOUT_SECS).toBe(60);
    expect(TIMEOUT_GRACE_SECS).toBe(5);
    expect(QUICK_PLAY_EXPIRY_SECS).toBe(120);
    expect(PRIVATE_ROOM_EXPIRY_SECS).toBe(1800);
    expect(GAME_STATE_BUFFER_SIZE).toBe(1024);
  });

  it('correctly derives PDAs for room, profile, and waiting spots', () => {
    const dummyUser = new PublicKey('11111111111111111111111111111111');

    const [roomPda, roomBump] = PublicKey.findProgramAddressSync(
      [Buffer.from(ROOM_SEED), dummyUser.toBuffer()],
      PROGRAM_ID
    );
    expect(roomPda).toBeInstanceOf(PublicKey);
    expect(roomPda.toBase58()).toBe('DmyePm88Q4ENToXvNvnHgkSz7anSkmMwKKa8TnpMF1VR');
    expect(typeof roomBump).toBe('number');
    expect(roomBump).toBeGreaterThanOrEqual(0);

    const [profilePda, profileBump] = PublicKey.findProgramAddressSync(
      [Buffer.from(PROFILE_SEED), dummyUser.toBuffer()],
      PROGRAM_ID
    );
    expect(profilePda).toBeInstanceOf(PublicKey);
    expect(profilePda.toBase58()).toBe('97yS4jVxBziVBnrpi6HQxXo9vGx91SXYTnE6Y183vRRL');
    expect(typeof profileBump).toBe('number');
    expect(profileBump).toBeGreaterThanOrEqual(0);

    const [waitPda, waitBump] = PublicKey.findProgramAddressSync(
      [Buffer.from(WAITING_SPOT_SEED), Buffer.from([0]), Buffer.from([0])],
      PROGRAM_ID
    );
    expect(waitPda).toBeInstanceOf(PublicKey);
    expect(waitPda.toBase58()).toBe('5gDvBsPeLoRrMq4oGtYm3foN6nYMmzzrAUyB86qaJ3Er');
    expect(typeof waitBump).toBe('number');
    expect(waitBump).toBeGreaterThanOrEqual(0);
  });

  it('verifies all 7 instruction signatures exist in generated IDL', () => {
    const instructionNames = idl.instructions.map((ix) => ix.name);
    expect(instructionNames).toContain('create_room');
    expect(instructionNames).toContain('join_room');
    expect(instructionNames).toContain('quick_play');
    expect(instructionNames).toContain('cancel_room');
    expect(instructionNames).toContain('game_action');
    expect(instructionNames).toContain('claim_timeout');
    expect(instructionNames).toContain('mint_badge');
  });

  it('verifies critical domain error codes are declared in IDL', () => {
    const errorNames = idl.errors.map((e) => e.name);
    expect(errorNames).toContain('AlreadyInActiveRoom');
    expect(errorNames).toContain('NotAPlayer');
    expect(errorNames).toContain('TimeoutNotElapsed');
    expect(errorNames).toContain('ActionTimedOut');
    expect(errorNames).toContain('CannotCancelActiveRoom');
    expect(errorNames).toContain('RoomNotOpen');
    expect(errorNames).toContain('RoomNotActive');
    expect(errorNames).toContain('UnauthorizedOpponent');
  });

  it('verifies account definitions in IDL', () => {
    const accountNames = idl.accounts.map((acc) => acc.name);
    expect(accountNames).toContain('MatchRoom');
    expect(accountNames).toContain('Profile');
  });
});
