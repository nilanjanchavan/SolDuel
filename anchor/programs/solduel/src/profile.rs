use anchor_lang::prelude::*;
use crate::constants::{
    BADGE_3_WIN_STREAK, BADGE_FIRST_WIN, BADGE_HIGH_ROLLER, BADGE_WORD_MASTER, INITIAL_RATING,
    MAX_RATING, MIN_RATING,
};
use crate::state::Profile;

/// Updates match statistics, streaks, badge unlock flags, and Elo ratings for both players upon match conclusion.
///
/// # Arguments
/// * `prof_0_acc` - AccountInfo for player 0's Profile PDA
/// * `prof_1_acc` - AccountInfo for player 1's Profile PDA
/// * `winner_opt` - Some(0) if player 0 won, Some(1) if player 1 won, None on draw
/// * `is_skill` - Whether the completed game is a skill game (only skill games alter Elo ratings)
/// * `is_direct_challenge` - Whether the match was a direct challenge with allowed_opponent (halves Elo changes)
/// * `tier` - Stake tier (0 = 100 coins, 1 = 300 coins, 2 = 500 coins)
/// * `is_flawless_win` - Whether the winner achieved flawless victory (e.g. Word Chain with 0 strikes)
pub fn update_ratings_and_stats_raw(
    prof_0_acc: &AccountInfo,
    prof_1_acc: &AccountInfo,
    winner_opt: Option<u8>,
    is_skill: bool,
    is_direct_challenge: bool,
    tier: u8,
    is_flawless_win: bool,
) -> Result<()> {
    // Both profiles must have at least Profile::LEN bytes
    if prof_0_acc.data_len() < Profile::LEN || prof_1_acc.data_len() < Profile::LEN {
        return Ok(());
    }

    // Handle edge case where both profile accounts are the same
    if prof_0_acc.key == prof_1_acc.key {
        let mut data = prof_0_acc.try_borrow_mut_data()?;
        data[34..66].copy_from_slice(Pubkey::default().as_ref());
        return Ok(());
    }

    let mut data_0 = prof_0_acc.try_borrow_mut_data()?;
    let mut data_1 = prof_1_acc.try_borrow_mut_data()?;

    let mut profile_0 = Profile {
        wins: u32::from_le_bytes(data_0[8..12].try_into().unwrap()),
        losses: u32::from_le_bytes(data_0[12..16].try_into().unwrap()),
        draws: u32::from_le_bytes(data_0[16..20].try_into().unwrap()),
        rating: u16::from_le_bytes(data_0[20..22].try_into().unwrap()),
        streak: u32::from_le_bytes(data_0[22..26].try_into().unwrap()),
        best_streak: u32::from_le_bytes(data_0[26..30].try_into().unwrap()),
        badges: u32::from_le_bytes(data_0[30..34].try_into().unwrap()),
        active_room: Pubkey::new_from_array(data_0[34..66].try_into().unwrap()),
        bump: data_0[66],
    };

    let mut profile_1 = Profile {
        wins: u32::from_le_bytes(data_1[8..12].try_into().unwrap()),
        losses: u32::from_le_bytes(data_1[12..16].try_into().unwrap()),
        draws: u32::from_le_bytes(data_1[16..20].try_into().unwrap()),
        rating: u16::from_le_bytes(data_1[20..22].try_into().unwrap()),
        streak: u32::from_le_bytes(data_1[22..26].try_into().unwrap()),
        best_streak: u32::from_le_bytes(data_1[26..30].try_into().unwrap()),
        badges: u32::from_le_bytes(data_1[30..34].try_into().unwrap()),
        active_room: Pubkey::new_from_array(data_1[34..66].try_into().unwrap()),
        bump: data_1[66],
    };

    profile_0.active_room = Pubkey::default();
    profile_1.active_room = Pubkey::default();

    if profile_0.rating == 0 {
        profile_0.rating = INITIAL_RATING;
    }
    if profile_1.rating == 0 {
        profile_1.rating = INITIAL_RATING;
    }

    match winner_opt {
        Some(0) => {
            profile_0.wins = profile_0.wins.checked_add(1).unwrap_or(u32::MAX);
            profile_0.streak = profile_0.streak.checked_add(1).unwrap_or(u32::MAX);
            if profile_0.streak > profile_0.best_streak {
                profile_0.best_streak = profile_0.streak;
            }

            profile_1.losses = profile_1.losses.checked_add(1).unwrap_or(u32::MAX);
            profile_1.streak = 0;

            // Badges for winner (Player 0)
            if profile_0.wins >= 1 {
                profile_0.badges |= BADGE_FIRST_WIN;
            }
            if profile_0.streak >= 3 {
                profile_0.badges |= BADGE_3_WIN_STREAK;
            }
            if is_flawless_win {
                profile_0.badges |= BADGE_WORD_MASTER;
            }
            if tier == 2 {
                profile_0.badges |= BADGE_HIGH_ROLLER;
            }

            // Skill games rating update
            if is_skill {
                let diff = (profile_1.rating as i32 - profile_0.rating as i32) / 25;
                let mut change = (16 + diff).clamp(4, 32) as u16;
                if is_direct_challenge {
                    change = (change / 2).max(2);
                }
                profile_0.rating = profile_0
                    .rating
                    .checked_add(change)
                    .map(|r| r.min(MAX_RATING))
                    .unwrap_or(MAX_RATING);
                profile_1.rating = profile_1
                    .rating
                    .checked_sub(change)
                    .map(|r| r.max(MIN_RATING))
                    .unwrap_or(MIN_RATING);
            }
        }
        Some(1) => {
            profile_1.wins = profile_1.wins.checked_add(1).unwrap_or(u32::MAX);
            profile_1.streak = profile_1.streak.checked_add(1).unwrap_or(u32::MAX);
            if profile_1.streak > profile_1.best_streak {
                profile_1.best_streak = profile_1.streak;
            }

            profile_0.losses = profile_0.losses.checked_add(1).unwrap_or(u32::MAX);
            profile_0.streak = 0;

            // Badges for winner (Player 1)
            if profile_1.wins >= 1 {
                profile_1.badges |= BADGE_FIRST_WIN;
            }
            if profile_1.streak >= 3 {
                profile_1.badges |= BADGE_3_WIN_STREAK;
            }
            if is_flawless_win {
                profile_1.badges |= BADGE_WORD_MASTER;
            }
            if tier == 2 {
                profile_1.badges |= BADGE_HIGH_ROLLER;
            }

            // Skill games rating update
            if is_skill {
                let diff = (profile_0.rating as i32 - profile_1.rating as i32) / 25;
                let mut change = (16 + diff).clamp(4, 32) as u16;
                if is_direct_challenge {
                    change = (change / 2).max(2);
                }
                profile_1.rating = profile_1
                    .rating
                    .checked_add(change)
                    .map(|r| r.min(MAX_RATING))
                    .unwrap_or(MAX_RATING);
                profile_0.rating = profile_0
                    .rating
                    .checked_sub(change)
                    .map(|r| r.max(MIN_RATING))
                    .unwrap_or(MIN_RATING);
            }
        }
        _ => {
            profile_0.draws = profile_0.draws.checked_add(1).unwrap_or(u32::MAX);
            profile_0.streak = 0;
            profile_1.draws = profile_1.draws.checked_add(1).unwrap_or(u32::MAX);
            profile_1.streak = 0;
            // No rating change on draw
        }
    }

    // Write back to account data
    data_0[8..12].copy_from_slice(&profile_0.wins.to_le_bytes());
    data_0[12..16].copy_from_slice(&profile_0.losses.to_le_bytes());
    data_0[16..20].copy_from_slice(&profile_0.draws.to_le_bytes());
    data_0[20..22].copy_from_slice(&profile_0.rating.to_le_bytes());
    data_0[22..26].copy_from_slice(&profile_0.streak.to_le_bytes());
    data_0[26..30].copy_from_slice(&profile_0.best_streak.to_le_bytes());
    data_0[30..34].copy_from_slice(&profile_0.badges.to_le_bytes());
    data_0[34..66].copy_from_slice(profile_0.active_room.as_ref());

    data_1[8..12].copy_from_slice(&profile_1.wins.to_le_bytes());
    data_1[12..16].copy_from_slice(&profile_1.losses.to_le_bytes());
    data_1[16..20].copy_from_slice(&profile_1.draws.to_le_bytes());
    data_1[20..22].copy_from_slice(&profile_1.rating.to_le_bytes());
    data_1[22..26].copy_from_slice(&profile_1.streak.to_le_bytes());
    data_1[26..30].copy_from_slice(&profile_1.best_streak.to_le_bytes());
    data_1[30..34].copy_from_slice(&profile_1.badges.to_le_bytes());
    data_1[34..66].copy_from_slice(profile_1.active_room.as_ref());

    Ok(())
}
