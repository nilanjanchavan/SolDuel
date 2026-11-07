use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::SolduelError;
use crate::MintBadge;
#[cfg(target_os = "solana")]
use mpl_core::instructions::CreateV1CpiBuilder;
#[cfg(target_os = "solana")]
use mpl_core::types::{PermanentFreezeDelegate, Plugin, PluginAuthority, PluginAuthorityPair};

/// Bit shift for minted badges in profile.badges bitmask (bits 16..19).
pub const BADGE_MINTED_MASK_SHIFT: u32 = 16;

/// Returns the display name for a given badge index.
pub fn badge_name(badge: u8) -> String {
    match badge {
        BADGE_INDEX_FIRST_WIN => "SolDuel: First Win".to_string(),
        BADGE_INDEX_3_WIN_STREAK => "SolDuel: 3-Win Streak".to_string(),
        BADGE_INDEX_WORD_MASTER => "SolDuel: Word Master".to_string(),
        BADGE_INDEX_HIGH_ROLLER => "SolDuel: High Roller".to_string(),
        _ => "SolDuel: Unknown Badge".to_string(),
    }
}

/// Returns the metadata URI for a given badge index.
pub fn badge_uri(badge: u8) -> String {
    match badge {
        BADGE_INDEX_FIRST_WIN => "https://solduel.app/badges/first-win.json".to_string(),
        BADGE_INDEX_3_WIN_STREAK => "https://solduel.app/badges/3-win-streak.json".to_string(),
        BADGE_INDEX_WORD_MASTER => "https://solduel.app/badges/word-master.json".to_string(),
        BADGE_INDEX_HIGH_ROLLER => "https://solduel.app/badges/high-roller.json".to_string(),
        _ => "https://solduel.app/badges/unknown.json".to_string(),
    }
}

/// Handles minting of an earned badge into a non-transferable Metaplex Core NFT.
///
/// Validates badge index, requirement flags, prior mint status, and required accounts.
/// Uses the player's Profile PDA as the update authority and PermanentFreezeDelegate authority.
pub fn handle_mint_badge<'info>(
    ctx: Context<'info, MintBadge<'info>>,
    badge: u8,
) -> Result<()> {
    if badge > 3 {
        return err!(SolduelError::InvalidBadge);
    }

    let earned_flag = 1u32 << (badge as u32);
    if (ctx.accounts.profile.badges & earned_flag) == 0 {
        return err!(SolduelError::BadgeRequirementNotMet);
    }

    let minted_flag = 1u32 << (BADGE_MINTED_MASK_SHIFT + badge as u32);
    if (ctx.accounts.profile.badges & minted_flag) != 0 {
        return err!(SolduelError::BadgeAlreadyMinted);
    }

    let asset_info = ctx
        .remaining_accounts
        .iter()
        .find(|a| a.is_signer && a.is_writable && a.key() != ctx.accounts.player.key())
        .ok_or(SolduelError::InvalidBadge)?;
    let mpl_core_program = ctx
        .remaining_accounts
        .iter()
        .find(|a| a.key() == mpl_core::ID)
        .ok_or(SolduelError::InvalidBadge)?;

    let player_info = ctx.accounts.player.to_account_info();
    let profile_info = ctx.accounts.profile.to_account_info();
    let sys_info = ctx.accounts.system_program.to_account_info();
    let profile_key = profile_info.key();

    #[cfg(target_os = "solana")]
    CreateV1CpiBuilder::new(mpl_core_program)
        .asset(asset_info)
        .payer(&player_info)
        .owner(Some(&player_info))
        .update_authority(Some(&profile_info))
        .system_program(&sys_info)
        .name(badge_name(badge))
        .uri(badge_uri(badge))
        .plugins(vec![PluginAuthorityPair {
            plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: true }),
            authority: Some(PluginAuthority::Address { address: profile_key }),
        }])
        .invoke()?;

    #[cfg(all(not(target_os = "solana"), any(test, feature = "test-game")))]
    {
        let _ = (
            &player_info,
            &profile_info,
            &sys_info,
            &profile_key,
            asset_info,
            mpl_core_program,
        );
    }

    #[cfg(all(not(target_os = "solana"), not(any(test, feature = "test-game"))))]
    {
        return err!(SolduelError::InvalidBadge);
    }

    // Only update profile after CPI successfully completes
    ctx.accounts.profile.badges |= minted_flag;

    Ok(())
}
