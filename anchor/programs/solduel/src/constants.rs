//! Global constants for SolDuel

/// 1 coin = 100,000 lamports
pub const LAMPORTS_PER_COIN: u64 = 100_000;

/// Stake tiers in coins: 100 / 300 / 500 (tier index 0 / 1 / 2)
pub const STAKE_TIERS_COINS: [u64; 3] = [100, 300, 500];
pub const TIER_0_COINS: u64 = 100;
pub const TIER_1_COINS: u64 = 300;
pub const TIER_2_COINS: u64 = 500;

/// Connect Four move timer: 60s
pub const CONNECT_FOUR_TIMEOUT_SECS: i64 = 60;

/// Word Chain turn timer: 30s
pub const WORD_CHAIN_TIMEOUT_SECS: i64 = 30;

/// Commit/reveal timer: 60s
pub const COMMIT_REVEAL_TIMEOUT_SECS: i64 = 60;

/// Grace period on timeout claims: 5s
pub const TIMEOUT_GRACE_SECS: i64 = 5;

/// Quick Play waiting spot expires after 120s
pub const QUICK_PLAY_EXPIRY_SECS: i64 = 120;

/// Private rooms expire after 30 minutes (1800s)
pub const PRIVATE_ROOM_EXPIRY_SECS: i64 = 1800;

/// Word chain rules: 4 strikes loses
pub const WORD_CHAIN_MAX_STRIKES: u8 = 4;

/// Word chain rules: minimum word length
pub const WORD_CHAIN_MIN_WORD_LEN: usize = 3;

/// Word chain rules: 2-letter combination flags (26 * 26)
pub const WORD_CHAIN_PREFIX_FLAGS_COUNT: usize = 676;

/// Starting skill rating
pub const INITIAL_RATING: u16 = 1000;

/// Badge bit flags
pub const BADGE_FIRST_WIN: u32 = 1 << 0;
pub const BADGE_3_WIN_STREAK: u32 = 1 << 1;
pub const BADGE_WORD_MASTER: u32 = 1 << 2;
pub const BADGE_HIGH_ROLLER: u32 = 1 << 3;

/// Badge indices for mint_badge instruction
pub const BADGE_INDEX_FIRST_WIN: u8 = 0;
pub const BADGE_INDEX_3_WIN_STREAK: u8 = 1;
pub const BADGE_INDEX_WORD_MASTER: u8 = 2;
pub const BADGE_INDEX_HIGH_ROLLER: u8 = 3;

/// PDA seeds
pub const ROOM_SEED: &[u8] = b"room";
pub const PROFILE_SEED: &[u8] = b"profile";
pub const WAITING_SPOT_SEED: &[u8] = b"wait";

/// Game-owned buffer size in MatchRoom
pub const GAME_STATE_BUFFER_SIZE: usize = 1024;

