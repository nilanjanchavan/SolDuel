use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::SolduelError;
use crate::games::{
    connect_four::ConnectFour, dice::DiceDuel, rps::RockPaperScissors, word_chain::WordChain,
    Game, GameKind, Outcome,
};
use crate::profile::update_ratings_and_stats_raw;
use crate::state::*;
use crate::{CancelRoom, ClaimTimeout, CreateRoom, GameAction, JoinRoom, QuickPlay};

/// Dummy game implementation for testing room lifecycle and dispatch
pub struct DummyGame;

impl Game for DummyGame {
    fn is_skill() -> bool {
        true
    }

    fn init(state: &mut [u8], first_player: u8, _now: i64) -> Result<()> {
        state[0] = first_player;
        Ok(())
    }

    fn apply(_state: &mut [u8], player: u8, data: &[u8], _now: i64) -> Result<Outcome> {
        if data.is_empty() {
            return Ok(Outcome::Continue);
        }
        match data[0] {
            0 => Ok(Outcome::Continue),
            1 => Ok(Outcome::Win(player)),
            2 => Ok(Outcome::Draw),
            3 => Ok(Outcome::Win(1 - player)),
            _ => Ok(Outcome::Continue),
        }
    }

    fn deadline_secs(_state: &[u8]) -> i64 {
        60
    }

    fn laggard(state: &[u8]) -> Option<u8> {
        // If state[1] == 1 => player 0 is holding things up
        // If state[1] == 2 => player 1 is holding things up
        // Else None => both
        match state.get(1).copied().unwrap_or(0) {
            1 => Some(0),
            2 => Some(1),
            _ => None,
        }
    }
}

pub fn get_tier_stake_lamports(tier: u8) -> Result<u64> {
    match tier {
        0 => Ok(100 * LAMPORTS_PER_COIN),
        1 => Ok(300 * LAMPORTS_PER_COIN),
        2 => Ok(500 * LAMPORTS_PER_COIN),
        _ => err!(SolduelError::InvalidTier),
    }
}

pub fn game_is_skill(game: u8) -> Result<bool> {
    if game == 255 {
        return Ok(DummyGame::is_skill());
    }
    match GameKind::from_u8(game) {
        Some(GameKind::ConnectFour) => Ok(ConnectFour::is_skill()),
        Some(GameKind::WordChain) => Ok(WordChain::is_skill()),
        Some(GameKind::Rps) => Ok(RockPaperScissors::is_skill()),
        Some(GameKind::Dice) => Ok(DiceDuel::is_skill()),
        None => err!(SolduelError::InvalidGame),
    }
}

pub fn game_init(game: u8, state: &mut [u8], first_player: u8, now: i64) -> Result<()> {
    if game == 255 {
        return DummyGame::init(state, first_player, now);
    }
    match GameKind::from_u8(game) {
        Some(GameKind::ConnectFour) => ConnectFour::init(state, first_player, now),
        Some(GameKind::WordChain) => WordChain::init(state, first_player, now),
        Some(GameKind::Rps) => RockPaperScissors::init(state, first_player, now),
        Some(GameKind::Dice) => DiceDuel::init(state, first_player, now),
        None => err!(SolduelError::InvalidGame),
    }
}

pub fn game_apply(
    game: u8,
    state: &mut [u8],
    player: u8,
    data: &[u8],
    now: i64,
) -> Result<Outcome> {
    if game == 255 {
        return DummyGame::apply(state, player, data, now);
    }
    match GameKind::from_u8(game) {
        Some(GameKind::ConnectFour) => ConnectFour::apply(state, player, data, now),
        Some(GameKind::WordChain) => WordChain::apply(state, player, data, now),
        Some(GameKind::Rps) => RockPaperScissors::apply(state, player, data, now),
        Some(GameKind::Dice) => DiceDuel::apply(state, player, data, now),
        None => err!(SolduelError::InvalidGame),
    }
}

pub fn game_deadline_secs(game: u8, state: &[u8]) -> Result<i64> {
    if game == 255 {
        return Ok(DummyGame::deadline_secs(state));
    }
    match GameKind::from_u8(game) {
        Some(GameKind::ConnectFour) => Ok(ConnectFour::deadline_secs(state)),
        Some(GameKind::WordChain) => Ok(WordChain::deadline_secs(state)),
        Some(GameKind::Rps) => Ok(RockPaperScissors::deadline_secs(state)),
        Some(GameKind::Dice) => Ok(DiceDuel::deadline_secs(state)),
        None => err!(SolduelError::InvalidGame),
    }
}

pub fn game_laggard(game: u8, state: &[u8]) -> Result<Option<u8>> {
    if game == 255 {
        return Ok(DummyGame::laggard(state));
    }
    match GameKind::from_u8(game) {
        Some(GameKind::ConnectFour) => Ok(ConnectFour::laggard(state)),
        Some(GameKind::WordChain) => Ok(WordChain::laggard(state)),
        Some(GameKind::Rps) => Ok(RockPaperScissors::laggard(state)),
        Some(GameKind::Dice) => Ok(DiceDuel::laggard(state)),
        None => err!(SolduelError::InvalidGame),
    }
}

pub enum MatchResult {
    Win(u8), // player index 0 | 1
    Draw,
}

pub fn handle_create_room(
    ctx: Context<CreateRoom>,
    game: u8,
    tier: u8,
    allowed_opponent: Option<Pubkey>,
) -> Result<()> {
    if game != 255 && GameKind::from_u8(game).is_none() {
        return err!(SolduelError::InvalidGame);
    }
    let stake = get_tier_stake_lamports(tier)?;

    let profile = &mut ctx.accounts.profile;
    if profile.active_room != Pubkey::default() {
        return err!(SolduelError::AlreadyInActiveRoom);
    }
    if profile.rating == 0 {
        profile.rating = INITIAL_RATING;
    }
    profile.bump = ctx.bumps.profile;

    // Escrow stake from creator to room PDA
    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.creator.key(),
        &ctx.accounts.room.key(),
        stake,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[
            ctx.accounts.creator.to_account_info(),
            ctx.accounts.room.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let now = Clock::get()?.unix_timestamp;
    let room = &mut ctx.accounts.room;
    room.game = game;
    room.tier = tier;
    room.creator = ctx.accounts.creator.key();
    room.players = [ctx.accounts.creator.key(), Pubkey::default()];
    room.status = RoomStatus::Open;
    room.allowed_opponent = allowed_opponent;
    room.is_quick_play = false;
    room.first_player = 0;
    room.created_ts = now;
    room.last_action_ts = now;
    room.deadline_ts = 0;
    room.state = [0u8; GAME_STATE_BUFFER_SIZE];
    room.bump = ctx.bumps.room;

    profile.active_room = room.key();

    Ok(())
}

pub fn handle_join_room(ctx: Context<JoinRoom>) -> Result<()> {
    let room = &mut ctx.accounts.room;
    if room.status != RoomStatus::Open {
        return err!(SolduelError::RoomNotOpen);
    }

    let player_key = ctx.accounts.player.key();
    if player_key == room.creator {
        return err!(SolduelError::AlreadyInActiveRoom);
    }

    if let Some(allowed) = room.allowed_opponent {
        if allowed != player_key {
            return err!(SolduelError::UnauthorizedOpponent);
        }
    }

    let profile = &mut ctx.accounts.profile;
    if profile.active_room != Pubkey::default() {
        return err!(SolduelError::AlreadyInActiveRoom);
    }
    if profile.rating == 0 {
        profile.rating = INITIAL_RATING;
    }
    profile.bump = ctx.bumps.profile;

    let stake = get_tier_stake_lamports(room.tier)?;
    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &player_key,
        &room.key(),
        stake,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[
            ctx.accounts.player.to_account_info(),
            room.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let first_player = ((clock.slot ^ now as u64) & 1) as u8;

    game_init(room.game, &mut room.state, first_player, now)?;
    let deadline_secs = game_deadline_secs(room.game, &room.state)?;
    let deadline_ts = now
        .checked_add(deadline_secs)
        .ok_or(SolduelError::MathOverflow)?;

    room.players[1] = player_key;
    room.status = RoomStatus::Active;
    room.first_player = first_player;
    room.last_action_ts = now;
    room.deadline_ts = deadline_ts;

    profile.active_room = room.key();

    Ok(())
}

pub fn handle_quick_play(ctx: Context<QuickPlay>, game: u8, tier: u8) -> Result<()> {
    if game != 255 && GameKind::from_u8(game).is_none() {
        return err!(SolduelError::InvalidGame);
    }
    let stake = get_tier_stake_lamports(tier)?;

    let profile = &mut ctx.accounts.profile;
    if profile.active_room != Pubkey::default() {
        return err!(SolduelError::AlreadyInActiveRoom);
    }
    if profile.rating == 0 {
        profile.rating = INITIAL_RATING;
    }
    profile.bump = ctx.bumps.profile;

    let waiting_spot_info = &ctx.accounts.waiting_spot;
    let (expected_spot, spot_bump) = Pubkey::find_program_address(
        &[WAITING_SPOT_SEED, &[game], &[tier]],
        ctx.program_id,
    );
    if waiting_spot_info.key() != expected_spot {
        return err!(SolduelError::InvalidGame);
    }

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let player_info = &ctx.accounts.player;
    let system_program = &ctx.accounts.system_program;

    // Check if waiting spot is active
    let mut spot_is_active = false;
    let mut spot_room_pubkey = Pubkey::default();
    let mut spot_created_ts: i64 = 0;

    if !waiting_spot_info.data_is_empty() {
        let spot_data = waiting_spot_info.try_borrow_data()?;
        if spot_data.len() >= WaitingSpot::LEN {
            let mut disc = [0u8; 8];
            disc.copy_from_slice(&spot_data[0..8]);
            if disc == WaitingSpot::DISCRIMINATOR {
                let mut room_bytes = [0u8; 32];
                room_bytes.copy_from_slice(&spot_data[8..40]);
                spot_room_pubkey = Pubkey::new_from_array(room_bytes);
                let mut ts_bytes = [0u8; 8];
                ts_bytes.copy_from_slice(&spot_data[40..48]);
                spot_created_ts = i64::from_le_bytes(ts_bytes);
                if spot_room_pubkey != Pubkey::default() {
                    spot_is_active = true;
                }
            }
        }
    }

    if spot_is_active {
        let is_expired = now.saturating_sub(spot_created_ts) > QUICK_PLAY_EXPIRY_SECS;

        if is_expired {
            // Expired spot: refund old creator and clear spot
            let old_room_info = &ctx.accounts.room;
            if old_room_info.key() == spot_room_pubkey {
                let mut old_room_data = old_room_info.try_borrow_mut_data()?;
                if old_room_data.len() >= MatchRoom::LEN {
                    // Check creator
                    let mut creator_bytes = [0u8; 32];
                    creator_bytes.copy_from_slice(&old_room_data[10..42]);
                    let old_creator_pubkey = Pubkey::new_from_array(creator_bytes);

                    if let Some(old_creator_info) = ctx
                        .remaining_accounts
                        .iter()
                        .find(|a| a.key() == old_creator_pubkey)
                    {
                        // Refund old room lamports to old creator
                        let refund_amount = old_room_info.lamports();
                        **old_room_info.try_borrow_mut_lamports()? = 0;
                        **old_creator_info.try_borrow_mut_lamports()? = old_creator_info
                            .lamports()
                            .checked_add(refund_amount)
                            .ok_or(SolduelError::MathOverflow)?;

                        // Mark old room cancelled
                        old_room_data[74] = RoomStatus::Cancelled as u8;
                    }
                }
                drop(old_room_data);

                // Clear waiting spot
                let mut spot_data = waiting_spot_info.try_borrow_mut_data()?;
                spot_data[8..40].copy_from_slice(Pubkey::default().as_ref());
                drop(spot_data);

                return Ok(());
            }
        } else {
            // Join existing room
            let room_info = &ctx.accounts.room;
            if room_info.key() != spot_room_pubkey {
                return err!(SolduelError::RoomNotOpen);
            }

            let room_data = room_info.try_borrow_data()?;
            if room_data.len() < MatchRoom::LEN {
                return err!(SolduelError::RoomNotOpen);
            }

            // Verify status is Open (byte 74)
            let status = room_data[74];
            if status != RoomStatus::Open as u8 {
                return err!(SolduelError::RoomNotOpen);
            }

            // Verify creator is not this player
            let mut creator_bytes = [0u8; 32];
            creator_bytes.copy_from_slice(&room_data[10..42]);
            let creator_pubkey = Pubkey::new_from_array(creator_bytes);
            if creator_pubkey == player_info.key() {
                return err!(SolduelError::AlreadyInActiveRoom);
            }

            // Transfer stake to room
            drop(room_data);
            let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
                &player_info.key(),
                &room_info.key(),
                stake,
            );
            anchor_lang::solana_program::program::invoke(
                &transfer_ix,
                &[
                    player_info.to_account_info(),
                    room_info.to_account_info(),
                    system_program.to_account_info(),
                ],
            )?;

            // Re-borrow and update room to Active
            let mut room_data = room_info.try_borrow_mut_data()?;
            let first_player = ((clock.slot ^ now as u64) & 1) as u8;

            // players[1] at 42..74
            room_data[42..74].copy_from_slice(player_info.key().as_ref());
            // status at 74
            room_data[74] = RoomStatus::Active as u8;
            // first_player at 108
            room_data[108] = first_player;
            // last_action_ts at 117..125
            room_data[117..125].copy_from_slice(&now.to_le_bytes());

            // Initialize game state in buffer (bytes 133..1157)
            let mut state_buf = [0u8; GAME_STATE_BUFFER_SIZE];
            state_buf.copy_from_slice(&room_data[133..133 + GAME_STATE_BUFFER_SIZE]);
            game_init(game, &mut state_buf, first_player, now)?;
            let deadline_secs = game_deadline_secs(game, &state_buf)?;
            let deadline_ts = now
                .checked_add(deadline_secs)
                .ok_or(SolduelError::MathOverflow)?;

            room_data[125..133].copy_from_slice(&deadline_ts.to_le_bytes());
            room_data[133..133 + GAME_STATE_BUFFER_SIZE].copy_from_slice(&state_buf);
            drop(room_data);

            // Clear waiting spot room to default
            let mut spot_data = waiting_spot_info.try_borrow_mut_data()?;
            spot_data[8..40].copy_from_slice(Pubkey::default().as_ref());
            drop(spot_data);

            ctx.accounts.profile.active_room = room_info.key();
            return Ok(());
        }
    }

    // Spot is empty: create Open room and write to waiting spot
    let (expected_room, room_bump) = Pubkey::find_program_address(
        &[ROOM_SEED, player_info.key().as_ref()],
        ctx.program_id,
    );
    if ctx.accounts.room.key() != expected_room {
        return err!(SolduelError::InvalidGame);
    }

    // Create room account if not exists
    let room_info = &ctx.accounts.room;
    if room_info.data_is_empty() {
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(MatchRoom::LEN);
        let create_ix = anchor_lang::solana_program::system_instruction::create_account(
            &player_info.key(),
            &room_info.key(),
            lamports,
            MatchRoom::LEN as u64,
            ctx.program_id,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &create_ix,
            &[
                player_info.to_account_info(),
                room_info.to_account_info(),
                system_program.to_account_info(),
            ],
            &[&[ROOM_SEED, player_info.key().as_ref(), &[room_bump]]],
        )?;
    }

    // Transfer stake to room
    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &player_info.key(),
        &room_info.key(),
        stake,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[
            player_info.to_account_info(),
            room_info.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;

    // Populate MatchRoom data
    let mut room_data = room_info.try_borrow_mut_data()?;
    let room_account = MatchRoom {
        game,
        tier,
        creator: player_info.key(),
        players: [player_info.key(), Pubkey::default()],
        status: RoomStatus::Open,
        allowed_opponent: None,
        is_quick_play: true,
        first_player: 0,
        created_ts: now,
        last_action_ts: now,
        deadline_ts: 0,
        state: [0u8; GAME_STATE_BUFFER_SIZE],
        bump: room_bump,
    };
    let mut disc = MatchRoom::DISCRIMINATOR.to_vec();
    room_account.serialize(&mut disc)?;
    room_data[..disc.len()].copy_from_slice(&disc);
    drop(room_data);

    // Create waiting spot if empty
    if waiting_spot_info.data_is_empty() {
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(WaitingSpot::LEN);
        let create_spot_ix =
            anchor_lang::solana_program::system_instruction::create_account(
                &player_info.key(),
                &waiting_spot_info.key(),
                lamports,
                WaitingSpot::LEN as u64,
                ctx.program_id,
            );
        anchor_lang::solana_program::program::invoke_signed(
            &create_spot_ix,
            &[
                player_info.to_account_info(),
                waiting_spot_info.to_account_info(),
                system_program.to_account_info(),
            ],
            &[&[WAITING_SPOT_SEED, &[game], &[tier], &[spot_bump]]],
        )?;
    }

    // Write to waiting spot
    let mut spot_data = waiting_spot_info.try_borrow_mut_data()?;
    let waiting_spot_acc = WaitingSpot {
        room: room_info.key(),
        created_ts: now,
        bump: spot_bump,
    };
    let mut spot_disc = WaitingSpot::DISCRIMINATOR.to_vec();
    waiting_spot_acc.serialize(&mut spot_disc)?;
    spot_data[..spot_disc.len()].copy_from_slice(&spot_disc);
    drop(spot_data);

    ctx.accounts.profile.active_room = room_info.key();

    Ok(())
}

pub fn handle_cancel_room(ctx: Context<CancelRoom>) -> Result<()> {
    let room = &mut ctx.accounts.room;
    if room.status != RoomStatus::Open {
        return err!(SolduelError::CannotCancelActiveRoom);
    }
    if room.creator != ctx.accounts.creator.key() {
        return err!(SolduelError::NotAPlayer);
    }

    // If quick play, clear waiting spot if passed
    if room.is_quick_play {
        let (expected_spot, _) = Pubkey::find_program_address(
            &[WAITING_SPOT_SEED, &[room.game], &[room.tier]],
            ctx.program_id,
        );
        if let Some(spot_info) = ctx.remaining_accounts.iter().find(|a| a.key() == expected_spot) {
            if !spot_info.data_is_empty() {
                let mut data = spot_info.try_borrow_mut_data()?;
                if data.len() >= WaitingSpot::LEN {
                    data[8..40].copy_from_slice(Pubkey::default().as_ref());
                }
            }
        }
    }

    // Refund all lamports to creator
    let room_info = room.to_account_info();
    let room_lamports = room_info.lamports();
    **room_info.try_borrow_mut_lamports()? = 0;
    **ctx.accounts.creator.try_borrow_mut_lamports()? = ctx
        .accounts
        .creator
        .lamports()
        .checked_add(room_lamports)
        .ok_or(SolduelError::MathOverflow)?;

    room.status = RoomStatus::Cancelled;
    ctx.accounts.profile.active_room = Pubkey::default();

    Ok(())
}

pub fn handle_game_action(ctx: Context<GameAction>, data: Vec<u8>) -> Result<()> {
    let room = &mut ctx.accounts.room;
    if room.status != RoomStatus::Active {
        return err!(SolduelError::RoomNotActive);
    }

    let player_key = ctx.accounts.player.key();
    let player_idx = if player_key == room.players[0] {
        0u8
    } else if player_key == room.players[1] {
        1u8
    } else {
        return err!(SolduelError::NotAPlayer);
    };

    let now = Clock::get()?.unix_timestamp;
    if room.deadline_ts > 0 && now > room.deadline_ts {
        return err!(SolduelError::ActionTimedOut);
    }

    let outcome = game_apply(room.game, &mut room.state, player_idx, &data, now)?;
    room.last_action_ts = now;

    match outcome {
        Outcome::Continue => {
            let deadline_secs = game_deadline_secs(room.game, &room.state)?;
            room.deadline_ts = now
                .checked_add(deadline_secs)
                .ok_or(SolduelError::MathOverflow)?;
        }
        Outcome::Win(winner) => {
            finish_room(&mut ctx.accounts.room, MatchResult::Win(winner), ctx.remaining_accounts)?;
        }
        Outcome::Draw => {
            finish_room(&mut ctx.accounts.room, MatchResult::Draw, ctx.remaining_accounts)?;
        }
    }

    Ok(())
}

pub fn handle_claim_timeout(ctx: Context<ClaimTimeout>) -> Result<()> {
    let room = &mut ctx.accounts.room;
    if room.status != RoomStatus::Active {
        return err!(SolduelError::RoomNotActive);
    }

    let claimant = ctx.accounts.claimant.key();
    if claimant != room.players[0] && claimant != room.players[1] {
        return err!(SolduelError::NotAPlayer);
    }

    let now = Clock::get()?.unix_timestamp;
    let claim_deadline = room
        .deadline_ts
        .checked_add(TIMEOUT_GRACE_SECS)
        .ok_or(SolduelError::MathOverflow)?;
    if now <= claim_deadline {
        return err!(SolduelError::TimeoutNotElapsed);
    }

    let laggard = game_laggard(room.game, &room.state)?;
    let result = match laggard {
        Some(laggard_idx) => MatchResult::Win(1 - laggard_idx),
        None => MatchResult::Draw,
    };

    finish_room(&mut ctx.accounts.room, result, ctx.remaining_accounts)?;

    Ok(())
}

/// Internal finish step: payouts, refunds, rent return to creator, account closing, clearing active_room
pub fn finish_room(
    room: &mut Account<'_, MatchRoom>,
    result: MatchResult,
    remaining_accounts: &[AccountInfo],
) -> Result<()> {
    let tier_stake = get_tier_stake_lamports(room.tier)?;
    let total_stake = tier_stake.checked_mul(2).ok_or(SolduelError::MathOverflow)?;

    let room_info = room.to_account_info();
    let room_lamports = room_info.lamports();
    let rent_lamports = room_lamports.saturating_sub(total_stake);

    let player_0_info = remaining_accounts.iter().find(|a| a.key() == room.players[0]);
    let player_1_info = remaining_accounts.iter().find(|a| a.key() == room.players[1]);

    if let (Some(p0), Some(p1)) = (player_0_info, player_1_info) {
        match result {
            MatchResult::Win(0) => {
                // Player 0 gets total stake (2x) + rent as creator
                let p0_payout = total_stake
                    .checked_add(rent_lamports)
                    .ok_or(SolduelError::MathOverflow)?;
                **room_info.try_borrow_mut_lamports()? = 0;
                **p0.try_borrow_mut_lamports()? = p0
                    .lamports()
                    .checked_add(p0_payout)
                    .ok_or(SolduelError::MathOverflow)?;
            }
            MatchResult::Win(1) => {
                // Player 1 gets total stake (2x); Player 0 gets rent back as creator
                **room_info.try_borrow_mut_lamports()? = 0;
                **p1.try_borrow_mut_lamports()? = p1
                    .lamports()
                    .checked_add(total_stake)
                    .ok_or(SolduelError::MathOverflow)?;
                **p0.try_borrow_mut_lamports()? = p0
                    .lamports()
                    .checked_add(rent_lamports)
                    .ok_or(SolduelError::MathOverflow)?;
            }
            MatchResult::Draw | MatchResult::Win(_) => {
                // Both refunded their stake; creator gets rent
                **room_info.try_borrow_mut_lamports()? = 0;
                **p1.try_borrow_mut_lamports()? = p1
                    .lamports()
                    .checked_add(tier_stake)
                    .ok_or(SolduelError::MathOverflow)?;
                let p0_refund = tier_stake
                    .checked_add(rent_lamports)
                    .ok_or(SolduelError::MathOverflow)?;
                **p0.try_borrow_mut_lamports()? = p0
                    .lamports()
                    .checked_add(p0_refund)
                    .ok_or(SolduelError::MathOverflow)?;
            }
        }
    }

    // Update profiles if provided in remaining accounts
    let is_skill = game_is_skill(room.game).unwrap_or(false);
    let (p0_profile_pda, _) =
        Pubkey::find_program_address(&[PROFILE_SEED, room.players[0].as_ref()], &crate::ID);
    let (p1_profile_pda, _) =
        Pubkey::find_program_address(&[PROFILE_SEED, room.players[1].as_ref()], &crate::ID);

    let prof_0_acc = remaining_accounts.iter().find(|a| a.key() == p0_profile_pda);
    let prof_1_acc = remaining_accounts.iter().find(|a| a.key() == p1_profile_pda);

    if let (Some(prof_0), Some(prof_1)) = (prof_0_acc, prof_1_acc) {
        let winner_opt = match result {
            MatchResult::Win(idx) => Some(idx),
            MatchResult::Draw => None,
        };
        update_ratings_and_stats_raw(prof_0, prof_1, winner_opt, is_skill)?;
    }

    room.status = RoomStatus::Finished;

    Ok(())
}
