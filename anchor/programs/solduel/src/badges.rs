use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::SolduelError;
use crate::MintBadge;
use mpl_core::instructions::CreateV1CpiBuilder;
use mpl_core::types::{PermanentFreezeDelegate, Plugin, PluginAuthorityPair};

/// Bit shift for minted badges in profile.badges bitmask (bits 16..19)
pub const BADGE_MINTED_MASK_SHIFT: u32 = 16;

pub fn badge_name(badge: u8) -> String {
    match badge {
        BADGE_INDEX_FIRST_WIN => "SolDuel: First Win".to_string(),
        BADGE_INDEX_3_WIN_STREAK => "SolDuel: 3-Win Streak".to_string(),
        BADGE_INDEX_WORD_MASTER => "SolDuel: Word Master".to_string(),
        BADGE_INDEX_HIGH_ROLLER => "SolDuel: High Roller".to_string(),
        _ => "SolDuel: Unknown Badge".to_string(),
    }
}

pub fn badge_uri(badge: u8) -> String {
    match badge {
        BADGE_INDEX_FIRST_WIN => "https://solduel.app/badges/first-win.json".to_string(),
        BADGE_INDEX_3_WIN_STREAK => "https://solduel.app/badges/3-win-streak.json".to_string(),
        BADGE_INDEX_WORD_MASTER => "https://solduel.app/badges/word-master.json".to_string(),
        BADGE_INDEX_HIGH_ROLLER => "https://solduel.app/badges/high-roller.json".to_string(),
        _ => "https://solduel.app/badges/unknown.json".to_string(),
    }
}

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

    let asset_info_opt = ctx
        .remaining_accounts
        .iter()
        .find(|a| a.is_signer && a.is_writable);
    let mpl_core_opt = ctx
        .remaining_accounts
        .iter()
        .find(|a| a.key() == mpl_core::ID);

    if let (Some(asset_info), Some(mpl_core_program)) = (asset_info_opt, mpl_core_opt) {
        let player_info = ctx.accounts.player.to_account_info();
        let sys_info = ctx.accounts.system_program.to_account_info();
        CreateV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .payer(&player_info)
            .owner(Some(&player_info))
            .system_program(&sys_info)
            .name(badge_name(badge))
            .uri(badge_uri(badge))
            .plugins(vec![PluginAuthorityPair {
                plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: true }),
                authority: None,
            }])
            .invoke()?;
    }

    ctx.accounts.profile.badges |= minted_flag;

    Ok(())
}
