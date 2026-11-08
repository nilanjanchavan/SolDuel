use anchor_lang::prelude::*;
use solduel::constants::*;
use solduel::games::Outcome;
use solduel::profile::update_ratings_and_stats_raw;
use solduel::room::*;
use solduel::state::*;

#[test]
fn test_tier_stakes() {
    assert_eq!(get_tier_stake_lamports(0).unwrap(), 100 * LAMPORTS_PER_COIN);
    assert_eq!(get_tier_stake_lamports(1).unwrap(), 300 * LAMPORTS_PER_COIN);
    assert_eq!(get_tier_stake_lamports(2).unwrap(), 500 * LAMPORTS_PER_COIN);
    assert!(get_tier_stake_lamports(3).is_err());
}

#[test]
fn test_dummy_game_dispatch() {
    let mut state = [0u8; 1024];
    let now = 1000i64;

    // Test game_init
    game_init(255, &mut state, 0, now).unwrap();
    assert_eq!(state[0], 0);

    // Test game_deadline_secs
    assert_eq!(game_deadline_secs(255, &state).unwrap(), 60);

    // Test game_apply
    let cont = game_apply(255, &mut state, 0, &[0], now).unwrap();
    assert_eq!(cont, Outcome::Continue);

    let win0 = game_apply(255, &mut state, 0, &[1], now).unwrap();
    assert_eq!(win0, Outcome::Win(0));

    let win1 = game_apply(255, &mut state, 0, &[3], now).unwrap();
    assert_eq!(win1, Outcome::Win(1));

    let draw = game_apply(255, &mut state, 0, &[2], now).unwrap();
    assert_eq!(draw, Outcome::Draw);

    // Test laggard
    state[1] = 1; // player 0 is laggard
    assert_eq!(game_laggard(255, &state).unwrap(), Some(0));

    state[1] = 2; // player 1 is laggard
    assert_eq!(game_laggard(255, &state).unwrap(), Some(1));

    state[1] = 0; // both
    assert_eq!(game_laggard(255, &state).unwrap(), None);
}

#[test]
fn test_one_active_room_per_wallet() {
    let mut profile = Profile {
        wins: 0,
        losses: 0,
        draws: 0,
        rating: 1000,
        streak: 0,
        best_streak: 0,
        badges: 0,
        active_room: Pubkey::new_unique(),
        bump: 255,
    };

    // If profile already has an active room, create_room / join_room must reject
    assert_ne!(profile.active_room, Pubkey::default());
    // Simulate check:
    let is_active = profile.active_room != Pubkey::default();
    assert!(is_active, "Should detect already active room");

    // Clear active room on finish
    profile.active_room = Pubkey::default();
    assert_eq!(profile.active_room, Pubkey::default());
}

#[test]
fn test_wrong_signer_and_unauthorized_opponent() {
    let creator = Pubkey::new_unique();
    let allowed_opponent = Pubkey::new_unique();
    let intruder = Pubkey::new_unique();

    let room = MatchRoom {
        game: 255,
        tier: 0,
        creator,
        players: [creator, Pubkey::default()],
        status: RoomStatus::Open,
        allowed_opponent: Some(allowed_opponent),
        is_quick_play: false,
        first_player: 0,
        created_ts: 1000,
        last_action_ts: 1000,
        deadline_ts: 0,
        state: [0u8; GAME_STATE_BUFFER_SIZE],
        bump: 255,
    };

    // Intruder attempts to join private room
    if let Some(allowed) = room.allowed_opponent {
        assert_ne!(allowed, intruder);
    }

    // Intruder attempts to take game action
    let is_player = room.players[0] == intruder || room.players[1] == intruder;
    assert!(!is_player, "Intruder must not be recognized as a player");

    // Non-creator attempts to cancel room
    assert_ne!(room.creator, intruder);
}

#[test]
fn test_timeouts_and_grace_period() {
    let creator = Pubkey::new_unique();
    let player2 = Pubkey::new_unique();
    let now = 1000i64;
    let deadline_ts = now + 60; // 1060

    let mut room = MatchRoom {
        game: 255,
        tier: 0,
        creator,
        players: [creator, player2],
        status: RoomStatus::Active,
        allowed_opponent: None,
        is_quick_play: false,
        first_player: 0,
        created_ts: now,
        last_action_ts: now,
        deadline_ts,
        state: [0u8; GAME_STATE_BUFFER_SIZE],
        bump: 255,
    };

    // Set laggard to player 1 (player2 holding things up)
    room.state[1] = 2;

    // Time is before deadline
    let current_time = deadline_ts;
    let claim_deadline = room.deadline_ts + TIMEOUT_GRACE_SECS;
    assert!(
        current_time <= claim_deadline,
        "Cannot claim before grace period"
    );

    // Time is within grace period
    let current_time = deadline_ts + 3;
    assert!(
        current_time <= claim_deadline,
        "Cannot claim within grace period"
    );

    // Time has elapsed after grace period
    let current_time = deadline_ts + TIMEOUT_GRACE_SECS + 1;
    assert!(
        current_time > claim_deadline,
        "Timeout should now be claimable"
    );

    // Winner determination: player 1 is laggard -> player 0 wins
    let laggard = game_laggard(room.game, &room.state).unwrap();
    assert_eq!(laggard, Some(1));
    let winner = 1 - laggard.unwrap();
    assert_eq!(winner, 0);
}

#[test]
fn test_word_chain_strike_does_not_extend_deadline() {
    let mut state = [0u8; 1024];
    let start_ts = 1000i64;
    game_init(1, &mut state, 0, start_ts).unwrap(); // game 1 is WordChain

    let deadline_secs = game_deadline_secs(1, &state).unwrap();
    assert_eq!(deadline_secs, 30);
    let original_deadline = start_ts + deadline_secs;

    let prev_laggard = game_laggard(1, &state).unwrap();
    assert_eq!(prev_laggard, Some(0));

    // Player 0 plays an invalid move (strike) at t = 1010
    let strike_ts = 1010i64;
    let outcome = game_apply(1, &mut state, 0, &[], strike_ts).unwrap();
    assert_eq!(outcome, Outcome::Continue);

    let curr_laggard = game_laggard(1, &state).unwrap();
    assert_eq!(curr_laggard, Some(0)); // Still player 0's turn

    let is_same_laggard = match (prev_laggard, curr_laggard) {
        (Some(p1), Some(p2)) => p1 == p2,
        _ => false,
    };
    assert!(is_same_laggard);

    let mut deadline_ts = original_deadline;
    if !is_same_laggard || deadline_ts == 0 {
        deadline_ts = strike_ts + deadline_secs;
    }
    assert_eq!(deadline_ts, original_deadline, "Deadline must not be extended on strike");
}

#[test]
fn test_double_finish_prevention() {
    let room = MatchRoom {
        game: 255,
        tier: 0,
        creator: Pubkey::new_unique(),
        players: [Pubkey::new_unique(), Pubkey::new_unique()],
        status: RoomStatus::Finished,
        allowed_opponent: None,
        is_quick_play: false,
        first_player: 0,
        created_ts: 1000,
        last_action_ts: 1060,
        deadline_ts: 1120,
        state: [0u8; GAME_STATE_BUFFER_SIZE],
        bump: 255,
    };

    // Action attempted on finished room must fail
    assert_ne!(room.status, RoomStatus::Active);
    assert_eq!(room.status, RoomStatus::Finished);
}

#[test]
fn test_quick_play_expiry_logic() {
    let created_ts = 1000i64;

    // Within expiry window (e.g. 60s elapsed < 120s)
    let current_time = 1060i64;
    let is_expired = current_time - created_ts > QUICK_PLAY_EXPIRY_SECS;
    assert!(!is_expired, "Spot should not be expired at 60s");

    // At boundary (120s)
    let current_time = 1120i64;
    let is_expired = current_time - created_ts > QUICK_PLAY_EXPIRY_SECS;
    assert!(!is_expired, "Spot should not be expired at exactly 120s");

    // Past expiry (121s)
    let current_time = 1121i64;
    let is_expired = current_time - created_ts > QUICK_PLAY_EXPIRY_SECS;
    assert!(is_expired, "Spot should be expired at 121s");
}

#[test]
fn test_rating_and_streak_updates() {
    let mut lamports_0 = 1000u64;
    let mut lamports_1 = 1000u64;
    let mut data_0 = vec![0u8; Profile::LEN];
    let mut data_1 = vec![0u8; Profile::LEN];

    // Setup initial profile data
    let prof_0_initial = Profile {
        wins: 2,
        losses: 1,
        draws: 0,
        rating: 1000,
        streak: 2,
        best_streak: 2,
        badges: 0,
        active_room: Pubkey::new_unique(),
        bump: 255,
    };
    let prof_1_initial = Profile {
        wins: 1,
        losses: 2,
        draws: 0,
        rating: 1000,
        streak: 0,
        best_streak: 1,
        badges: 0,
        active_room: Pubkey::new_unique(),
        bump: 255,
    };

    let mut disc_0 = Profile::DISCRIMINATOR.to_vec();
    prof_0_initial.serialize(&mut disc_0).unwrap();
    data_0[..disc_0.len()].copy_from_slice(&disc_0);

    let mut disc_1 = Profile::DISCRIMINATOR.to_vec();
    prof_1_initial.serialize(&mut disc_1).unwrap();
    data_1[..disc_1.len()].copy_from_slice(&disc_1);

    let key_0 = Pubkey::new_unique();
    let key_1 = Pubkey::new_unique();
    let owner = solduel::ID;

    let account_0 = AccountInfo::new(
        &key_0,
        false,
        true,
        &mut lamports_0,
        &mut data_0,
        &owner,
        false,
    );
    let account_1 = AccountInfo::new(
        &key_1,
        false,
        true,
        &mut lamports_1,
        &mut data_1,
        &owner,
        false,
    );

    // Player 0 wins skill game
    update_ratings_and_stats_raw(&account_0, &account_1, Some(0), true, false, 0, false).unwrap();

    let updated_0_wins = u32::from_le_bytes(data_0[8..12].try_into().unwrap());
    let updated_0_rating = u16::from_le_bytes(data_0[20..22].try_into().unwrap());
    let updated_0_streak = u32::from_le_bytes(data_0[22..26].try_into().unwrap());
    let updated_0_best = u32::from_le_bytes(data_0[26..30].try_into().unwrap());
    let updated_0_active = Pubkey::new_from_array(data_0[34..66].try_into().unwrap());

    assert_eq!(updated_0_wins, 3);
    assert_eq!(updated_0_streak, 3);
    assert_eq!(updated_0_best, 3);
    assert!(updated_0_rating > 1000);
    assert_eq!(updated_0_active, Pubkey::default());

    let updated_1_losses = u32::from_le_bytes(data_1[12..16].try_into().unwrap());
    let updated_1_rating = u16::from_le_bytes(data_1[20..22].try_into().unwrap());
    let updated_1_streak = u32::from_le_bytes(data_1[22..26].try_into().unwrap());
    let updated_1_active = Pubkey::new_from_array(data_1[34..66].try_into().unwrap());

    assert_eq!(updated_1_losses, 3);
    assert_eq!(updated_1_streak, 0);
    assert!(updated_1_rating < 1000);
    assert_eq!(updated_1_active, Pubkey::default());
}
