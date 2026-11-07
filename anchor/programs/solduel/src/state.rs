use anchor_lang::prelude::*;
use crate::constants::GAME_STATE_BUFFER_SIZE;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default, Debug)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum RoomStatus {
    #[default]
    Open = 0,
    Active = 1,
    Finished = 2,
    Cancelled = 3,
}

#[account]
#[derive(Debug)]
pub struct MatchRoom {
    pub game: u8,
    pub tier: u8,
    pub creator: Pubkey,
    pub players: [Pubkey; 2],
    pub status: RoomStatus,
    pub allowed_opponent: Option<Pubkey>,
    pub is_quick_play: bool,
    pub first_player: u8,
    pub created_ts: i64,
    pub last_action_ts: i64,
    pub deadline_ts: i64,
    pub state: [u8; GAME_STATE_BUFFER_SIZE],
    pub bump: u8,
}

impl MatchRoom {
    pub const LEN: usize = 8 // discriminator
        + 1                  // game
        + 1                  // tier
        + 32                 // creator
        + 64                 // players: [Pubkey; 2]
        + 1                  // status
        + (1 + 32)           // allowed_opponent: Option<Pubkey>
        + 1                  // is_quick_play
        + 1                  // first_player
        + 8                  // created_ts
        + 8                  // last_action_ts
        + 8                  // deadline_ts
        + GAME_STATE_BUFFER_SIZE // state: [u8; 1024]
        + 1;                 // bump
}

#[account]
#[derive(Debug)]
pub struct Profile {
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub rating: u16,
    pub streak: u32,
    pub best_streak: u32,
    pub badges: u32,
    pub active_room: Pubkey,
    pub bump: u8,
}

impl Profile {
    pub const LEN: usize = 8 // discriminator
        + 4                  // wins
        + 4                  // losses
        + 4                  // draws
        + 2                  // rating
        + 4                  // streak
        + 4                  // best_streak
        + 4                  // badges
        + 32                 // active_room
        + 1;                 // bump
}

#[account]
#[derive(Debug)]
pub struct WaitingSpot {
    pub room: Pubkey,
    pub created_ts: i64,
    pub bump: u8,
}

impl WaitingSpot {
    pub const LEN: usize = 8 // discriminator
        + 32                 // room
        + 8                  // created_ts
        + 1;                 // bump
}

