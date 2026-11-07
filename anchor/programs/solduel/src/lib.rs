use anchor_lang::prelude::*;

pub mod badges;
pub mod constants;
pub mod errors;
pub mod games;
pub mod profile;
pub mod room;
pub mod state;

use constants::*;
use state::*;

declare_id!("HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u");

#[program]
pub mod solduel {
    use super::*;

    /// Creates an open match room with escrowed stake and sets creator's active room.
    pub fn create_room(
        ctx: Context<CreateRoom>,
        game: u8,
        tier: u8,
        allowed_opponent: Option<Pubkey>,
    ) -> Result<()> {
        room::handle_create_room(ctx, game, tier, allowed_opponent)
    }

    /// Joins an open room, escrows the challenger stake, and transitions room to active.
    pub fn join_room(ctx: Context<JoinRoom>) -> Result<()> {
        room::handle_join_room(ctx)
    }

    /// Matchmakes or queues in a Quick Play waiting spot, reclaiming expired spots if needed.
    pub fn quick_play(ctx: Context<QuickPlay>, game: u8, tier: u8) -> Result<()> {
        room::handle_quick_play(ctx, game, tier)
    }

    /// Cancels an open room before an opponent joins, refunding stake and rent to creator.
    pub fn cancel_room(ctx: Context<CancelRoom>) -> Result<()> {
        room::handle_cancel_room(ctx)
    }

    /// Submits a game move/action, executing deterministic game rules and settling on conclusion.
    pub fn game_action(ctx: Context<GameAction>, data: Vec<u8>) -> Result<()> {
        room::handle_game_action(ctx, data)
    }

    /// Claims a forfeit victory or draw settlement when a player's move timer has elapsed.
    pub fn claim_timeout(ctx: Context<ClaimTimeout>) -> Result<()> {
        room::handle_claim_timeout(ctx)
    }

    /// Mints an unlocked profile achievement badge as a soulbound NFT.
    pub fn mint_badge<'info>(ctx: Context<'info, MintBadge<'info>>, badge: u8) -> Result<()> {
        badges::handle_mint_badge(ctx, badge)
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
