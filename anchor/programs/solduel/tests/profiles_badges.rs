use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use solduel::badges::{handle_mint_badge, BADGE_MINTED_MASK_SHIFT};
use solduel::constants::*;
use solduel::errors::SolduelError;
use solduel::profile::update_ratings_and_stats_raw;
use solduel::state::Profile;
use solduel::MintBadge;

fn create_profile_data(
    wins: u32,
    losses: u32,
    draws: u32,
    rating: u16,
    streak: u32,
    best_streak: u32,
    badges: u32,
) -> Vec<u8> {
    let mut data = vec![0u8; Profile::LEN];
    let profile = Profile {
        wins,
        losses,
        draws,
        rating,
        streak,
        best_streak,
        badges,
        active_room: Pubkey::new_unique(),
        bump: 255,
    };
    let mut disc = Profile::DISCRIMINATOR.to_vec();
    profile.serialize(&mut disc).unwrap();
    data[..disc.len()].copy_from_slice(&disc);
    data
}

fn read_profile(data: &[u8]) -> Profile {
    Profile {
        wins: u32::from_le_bytes(data[8..12].try_into().unwrap()),
        losses: u32::from_le_bytes(data[12..16].try_into().unwrap()),
        draws: u32::from_le_bytes(data[16..20].try_into().unwrap()),
        rating: u16::from_le_bytes(data[20..22].try_into().unwrap()),
        streak: u32::from_le_bytes(data[22..26].try_into().unwrap()),
        best_streak: u32::from_le_bytes(data[26..30].try_into().unwrap()),
        badges: u32::from_le_bytes(data[30..34].try_into().unwrap()),
        active_room: Pubkey::new_from_array(data[34..66].try_into().unwrap()),
        bump: data[66],
    }
}

#[test]
fn test_skill_rating_updates_and_smaller_gains_against_same_opponent() {
    let mut lamports_0 = 1_000_000;
    let mut lamports_1 = 1_000_000;
    let mut data_0 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    let mut data_1 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);

    let key_0 = Pubkey::new_unique();
    let key_1 = Pubkey::new_unique();
    let owner = solduel::ID;

    // Standard open match: Winner gets standard change
    {
        let acc_0 = AccountInfo::new(&key_0, false, true, &mut lamports_0, &mut data_0, &owner, false);
        let acc_1 = AccountInfo::new(&key_1, false, true, &mut lamports_1, &mut data_1, &owner, false);

        // Player 0 wins skill game, open challenge (is_direct_challenge = false)
        update_ratings_and_stats_raw(&acc_0, &acc_1, Some(0), true, false, 0, false).unwrap();
    }

    let p0 = read_profile(&data_0);
    let p1 = read_profile(&data_1);

    assert_eq!(p0.wins, 1);
    assert_eq!(p0.rating, 1016); // 1000 + 16
    assert_eq!(p1.losses, 1);
    assert_eq!(p1.rating, 984); // 1000 - 16

    // Direct challenge (same/specified opponent): Smaller gain (50% damped)
    let mut data_2 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    let mut data_3 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    let mut l_2 = 1_000_000;
    let mut l_3 = 1_000_000;
    let k_2 = Pubkey::new_unique();
    let k_3 = Pubkey::new_unique();

    {
        let acc_2 = AccountInfo::new(&k_2, false, true, &mut l_2, &mut data_2, &owner, false);
        let acc_3 = AccountInfo::new(&k_3, false, true, &mut l_3, &mut data_3, &owner, false);

        // Player 2 wins skill game, direct challenge (is_direct_challenge = true)
        update_ratings_and_stats_raw(&acc_2, &acc_3, Some(0), true, true, 0, false).unwrap();
    }

    let p2 = read_profile(&data_2);
    let p3 = read_profile(&data_3);

    assert_eq!(p2.rating, 1008); // 16 / 2 = 8 gain
    assert_eq!(p3.rating, 992); // 16 / 2 = 8 loss
}

#[test]
fn test_luck_games_and_draws_do_not_alter_rating() {
    let mut l_0 = 1_000_000;
    let mut l_1 = 1_000_000;
    let mut data_0 = create_profile_data(2, 1, 0, 1100, 2, 2, 0);
    let mut data_1 = create_profile_data(1, 2, 0, 950, 0, 1, 0);

    let k_0 = Pubkey::new_unique();
    let k_1 = Pubkey::new_unique();
    let owner = solduel::ID;

    // Luck game: is_skill = false
    {
        let acc_0 = AccountInfo::new(&k_0, false, true, &mut l_0, &mut data_0, &owner, false);
        let acc_1 = AccountInfo::new(&k_1, false, true, &mut l_1, &mut data_1, &owner, false);

        update_ratings_and_stats_raw(&acc_0, &acc_1, Some(0), false, false, 0, false).unwrap();
    }

    let p0 = read_profile(&data_0);
    let p1 = read_profile(&data_1);

    assert_eq!(p0.wins, 3);
    assert_eq!(p0.rating, 1100); // Unchanged!
    assert_eq!(p1.losses, 3);
    assert_eq!(p1.rating, 950); // Unchanged!

    // Draw in skill game
    {
        let acc_0 = AccountInfo::new(&k_0, false, true, &mut l_0, &mut data_0, &owner, false);
        let acc_1 = AccountInfo::new(&k_1, false, true, &mut l_1, &mut data_1, &owner, false);

        update_ratings_and_stats_raw(&acc_0, &acc_1, None, true, false, 0, false).unwrap();
    }

    let p0_draw = read_profile(&data_0);
    let p1_draw = read_profile(&data_1);

    assert_eq!(p0_draw.draws, 1);
    assert_eq!(p0_draw.streak, 0); // streak reset
    assert_eq!(p0_draw.best_streak, 3);
    assert_eq!(p0_draw.rating, 1100); // Unchanged on draw!

    assert_eq!(p1_draw.draws, 1);
    assert_eq!(p1_draw.streak, 0);
    assert_eq!(p1_draw.rating, 950);
}

#[test]
fn test_all_badge_flags_awarded() {
    let mut l_0 = 1_000_000;
    let mut l_1 = 1_000_000;
    let k_0 = Pubkey::new_unique();
    let k_1 = Pubkey::new_unique();
    let owner = solduel::ID;

    // 1. First Win badge
    let mut data_0 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    let mut data_1 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    {
        let acc_0 = AccountInfo::new(&k_0, false, true, &mut l_0, &mut data_0, &owner, false);
        let acc_1 = AccountInfo::new(&k_1, false, true, &mut l_1, &mut data_1, &owner, false);

        update_ratings_and_stats_raw(&acc_0, &acc_1, Some(0), true, false, 0, false).unwrap();
    }
    let p0 = read_profile(&data_0);
    assert!(p0.badges & BADGE_FIRST_WIN != 0);
    assert_eq!(p0.badges & BADGE_3_WIN_STREAK, 0);

    // 2. 3-Win Streak badge
    let mut data_2 = create_profile_data(2, 0, 0, 1032, 2, 2, BADGE_FIRST_WIN);
    let mut data_3 = create_profile_data(1, 1, 0, 1000, 0, 1, 0);
    {
        let acc_2 = AccountInfo::new(&k_0, false, true, &mut l_0, &mut data_2, &owner, false);
        let acc_3 = AccountInfo::new(&k_1, false, true, &mut l_1, &mut data_3, &owner, false);

        update_ratings_and_stats_raw(&acc_2, &acc_3, Some(0), true, false, 0, false).unwrap();
    }
    let p2 = read_profile(&data_2);
    assert_eq!(p2.streak, 3);
    assert!(p2.badges & BADGE_FIRST_WIN != 0);
    assert!(p2.badges & BADGE_3_WIN_STREAK != 0);

    // 3. Word Master badge (flawless win)
    let mut data_4 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    let mut data_5 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    {
        let acc_4 = AccountInfo::new(&k_0, false, true, &mut l_0, &mut data_4, &owner, false);
        let acc_5 = AccountInfo::new(&k_1, false, true, &mut l_1, &mut data_5, &owner, false);

        // Player 1 wins Word Chain flawlessly
        update_ratings_and_stats_raw(&acc_4, &acc_5, Some(1), true, false, 0, true).unwrap();
    }
    let p5 = read_profile(&data_5);
    assert!(p5.badges & BADGE_FIRST_WIN != 0);
    assert!(p5.badges & BADGE_WORD_MASTER != 0);

    // 4. High Roller badge (tier 2 = 500 coins)
    let mut data_6 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    let mut data_7 = create_profile_data(0, 0, 0, 1000, 0, 0, 0);
    {
        let acc_6 = AccountInfo::new(&k_0, false, true, &mut l_0, &mut data_6, &owner, false);
        let acc_7 = AccountInfo::new(&k_1, false, true, &mut l_1, &mut data_7, &owner, false);

        update_ratings_and_stats_raw(&acc_6, &acc_7, Some(0), true, false, 2, false).unwrap();
    }
    let p6 = read_profile(&data_6);
    assert!(p6.badges & BADGE_HIGH_ROLLER != 0);
}

#[test]
fn test_handle_mint_badge_validation() {
    let player_key = Pubkey::new_unique();
    let (profile_pda, _bump) =
        Pubkey::find_program_address(&[PROFILE_SEED, player_key.as_ref()], &solduel::ID);

    // 1. Invalid badge index (> 3)
    {
        let mut data = create_profile_data(5, 1, 0, 1050, 3, 3, BADGE_FIRST_WIN | BADGE_3_WIN_STREAK);
        let mut l_prof = 1_000_000;
        let mut l_player = 1_000_000;
        let mut l_sys = 1_000_000;
        let mut data_player = vec![];
        let mut data_sys = vec![];

        let sys_key = anchor_lang::system_program::ID;
        let acc_prof = AccountInfo::new(&profile_pda, false, true, &mut l_prof, &mut data, &solduel::ID, false);
        let acc_player = AccountInfo::new(&player_key, true, true, &mut l_player, &mut data_player, &sys_key, false);
        let acc_sys = AccountInfo::new(&sys_key, false, false, &mut l_sys, &mut data_sys, &sys_key, true);

        let mut accounts = MintBadge {
            profile: Account::<Profile>::try_from(&acc_prof).unwrap(),
            player: Signer::try_from(&acc_player).unwrap(),
            system_program: Program::<anchor_lang::system_program::System>::try_from(&acc_sys).unwrap(),
        };
        let ctx = Context::new(&solduel::ID, &mut accounts, &[], solduel::MintBadgeBumps {});
        let err = handle_mint_badge(ctx, 4).unwrap_err();
        assert_eq!(err, SolduelError::InvalidBadge.into());
    }

    // 2. Unearned badge (Word Master = index 2)
    {
        let mut data = create_profile_data(5, 1, 0, 1050, 3, 3, BADGE_FIRST_WIN | BADGE_3_WIN_STREAK);
        let mut l_prof = 1_000_000;
        let mut l_player = 1_000_000;
        let mut l_sys = 1_000_000;
        let mut data_player = vec![];
        let mut data_sys = vec![];

        let sys_key = anchor_lang::system_program::ID;
        let acc_prof = AccountInfo::new(&profile_pda, false, true, &mut l_prof, &mut data, &solduel::ID, false);
        let acc_player = AccountInfo::new(&player_key, true, true, &mut l_player, &mut data_player, &sys_key, false);
        let acc_sys = AccountInfo::new(&sys_key, false, false, &mut l_sys, &mut data_sys, &sys_key, true);

        let mut accounts = MintBadge {
            profile: Account::<Profile>::try_from(&acc_prof).unwrap(),
            player: Signer::try_from(&acc_player).unwrap(),
            system_program: Program::<anchor_lang::system_program::System>::try_from(&acc_sys).unwrap(),
        };
        let ctx = Context::new(&solduel::ID, &mut accounts, &[], solduel::MintBadgeBumps {});
        let err = handle_mint_badge(ctx, BADGE_INDEX_WORD_MASTER).unwrap_err();
        assert_eq!(err, SolduelError::BadgeRequirementNotMet.into());
    }

    // 3. Earned badge minting succeeds (First Win = index 0)
    let minted_flag_0 = 1u32 << (BADGE_MINTED_MASK_SHIFT + BADGE_INDEX_FIRST_WIN as u32);
    {
        let mut data = create_profile_data(5, 1, 0, 1050, 3, 3, BADGE_FIRST_WIN | BADGE_3_WIN_STREAK);
        let mut l_prof = 1_000_000;
        let mut l_player = 1_000_000;
        let mut l_sys = 1_000_000;
        let mut data_player = vec![];
        let mut data_sys = vec![];

        let sys_key = anchor_lang::system_program::ID;
        let acc_prof = AccountInfo::new(&profile_pda, false, true, &mut l_prof, &mut data, &solduel::ID, false);
        let acc_player = AccountInfo::new(&player_key, true, true, &mut l_player, &mut data_player, &sys_key, false);
        let acc_sys = AccountInfo::new(&sys_key, false, false, &mut l_sys, &mut data_sys, &sys_key, true);

        let mut accounts = MintBadge {
            profile: Account::<Profile>::try_from(&acc_prof).unwrap(),
            player: Signer::try_from(&acc_player).unwrap(),
            system_program: Program::<anchor_lang::system_program::System>::try_from(&acc_sys).unwrap(),
        };
        let ctx = Context::new(&solduel::ID, &mut accounts, &[], solduel::MintBadgeBumps {});
        let res = handle_mint_badge(ctx, BADGE_INDEX_FIRST_WIN);
        assert!(res.is_ok());
    }

    // 4. Duplicate mint attempt returns BadgeAlreadyMinted
    {
        let mut data = create_profile_data(
            5,
            1,
            0,
            1050,
            3,
            3,
            BADGE_FIRST_WIN | BADGE_3_WIN_STREAK | minted_flag_0,
        );
        let mut l_prof = 1_000_000;
        let mut l_player = 1_000_000;
        let mut l_sys = 1_000_000;
        let mut data_player = vec![];
        let mut data_sys = vec![];

        let sys_key = anchor_lang::system_program::ID;
        let acc_prof = AccountInfo::new(&profile_pda, false, true, &mut l_prof, &mut data, &solduel::ID, false);
        let acc_player = AccountInfo::new(&player_key, true, true, &mut l_player, &mut data_player, &sys_key, false);
        let acc_sys = AccountInfo::new(&sys_key, false, false, &mut l_sys, &mut data_sys, &sys_key, true);

        let mut accounts = MintBadge {
            profile: Account::<Profile>::try_from(&acc_prof).unwrap(),
            player: Signer::try_from(&acc_player).unwrap(),
            system_program: Program::<anchor_lang::system_program::System>::try_from(&acc_sys).unwrap(),
        };
        let ctx = Context::new(&solduel::ID, &mut accounts, &[], solduel::MintBadgeBumps {});
        let err = handle_mint_badge(ctx, BADGE_INDEX_FIRST_WIN).unwrap_err();
        assert_eq!(err, SolduelError::BadgeAlreadyMinted.into());
    }
}
