use anchor_lang::prelude::*;

pub mod badges;
pub mod constants;
pub mod errors;
pub mod games;
pub mod profile;
pub mod room;
pub mod state;

use constants::*;
use errors::SolduelError;
use state::*;

declare_id!("HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u");

#[program]
pub mod solduel {
    use super::*;

    pub fn create_room(
        _ctx: Context<CreateRoom>,
        _game: u8,
        _tier: u8,
        _allowed_opponent: Option<Pubkey>,
    ) -> Result<()> {
        err!(SolduelError::NotImplemented)
    }

    pub fn join_room(_ctx: Context<JoinRoom>) -> Result<()> {
        err!(SolduelError::NotImplemented)
    }

    pub fn quick_play(_ctx: Context<QuickPlay>, _game: u8, _tier: u8) -> Result<()> {
        err!(SolduelError::NotImplemented)
    }

    pub fn cancel_room(_ctx: Context<CancelRoom>) -> Result<()> {
        err!(SolduelError::NotImplemented)
    }

    pub fn game_action(_ctx: Context<GameAction>, _data: Vec<u8>) -> Result<()> {
        err!(SolduelError::NotImplemented)
    }

    pub fn claim_timeout(_ctx: Context<ClaimTimeout>) -> Result<()> {
        err!(SolduelError::NotImplemented)
    }

    pub fn mint_badge(_ctx: Context<MintBadge>, _badge: u8) -> Result<()> {
        err!(SolduelError::NotImplemented)
    }
}

#[derive(Accounts)]
#[instruction(game: u8, tier: u8, allowed_opponent: Option<Pubkey>)]
pub struct CreateRoom<'info> {
    #[account(
        init,
        payer = creator,
        space = MatchRoom::LEN,
        seeds = [ROOM_SEED, creator.key().as_ref()],
        bump
    )]
    pub room: Box<Account<'info, MatchRoom>>,

    #[account(
        init_if_needed,
        payer = creator,
        space = Profile::LEN,
        seeds = [PROFILE_SEED, creator.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub room: Box<Account<'info, MatchRoom>>,

    #[account(
        init_if_needed,
        payer = player,
        space = Profile::LEN,
        seeds = [PROFILE_SEED, player.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game: u8, tier: u8)]
pub struct QuickPlay<'info> {
    /// CHECK: Validated in handler via seeds and logic
    #[account(mut)]
    pub waiting_spot: UncheckedAccount<'info>,

    /// CHECK: Validated in handler depending on whether joining or creating
    #[account(mut)]
    pub room: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = player,
        space = Profile::LEN,
        seeds = [PROFILE_SEED, player.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelRoom<'info> {
    #[account(
        mut,
        seeds = [ROOM_SEED, creator.key().as_ref()],
        bump = room.bump
    )]
    pub room: Box<Account<'info, MatchRoom>>,

    #[account(
        mut,
        seeds = [PROFILE_SEED, creator.key().as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GameAction<'info> {
    #[account(mut)]
    pub room: Box<Account<'info, MatchRoom>>,

    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimTimeout<'info> {
    #[account(mut)]
    pub room: Box<Account<'info, MatchRoom>>,

    #[account(mut)]
    pub claimant: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(badge: u8)]
pub struct MintBadge<'info> {
    #[account(
        mut,
        seeds = [PROFILE_SEED, player.key().as_ref()],
        bump = profile.bump
    )]
    pub profile: Account<'info, Profile>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}
