use anchor_lang::prelude::*;

#[error_code]
pub enum SolduelError {
    #[msg("Feature or instruction is not implemented yet.")]
    NotImplemented,
    #[msg("Invalid game kind.")]
    InvalidGame,
    #[msg("Invalid stake tier.")]
    InvalidTier,
    #[msg("Room is not open for joining.")]
    RoomNotOpen,
    #[msg("Room is not active.")]
    RoomNotActive,
    #[msg("Opponent is not allowed in private room.")]
    UnauthorizedOpponent,
    #[msg("Not a player in this room.")]
    NotAPlayer,
    #[msg("Player already has an active room.")]
    AlreadyInActiveRoom,
    #[msg("Not your turn.")]
    NotYourTurn,
    #[msg("Action submitted after deadline.")]
    ActionTimedOut,
    #[msg("Timeout cannot be claimed before deadline plus grace period.")]
    TimeoutNotElapsed,
    #[msg("Cannot cancel room after it has started.")]
    CannotCancelActiveRoom,
    #[msg("Waiting spot has expired.")]
    WaitingSpotExpired,
    #[msg("Invalid badge index.")]
    InvalidBadge,
    #[msg("Badge already minted.")]
    BadgeAlreadyMinted,
    #[msg("Badge requirement not met.")]
    BadgeRequirementNotMet,
    #[msg("Arithmetic overflow or underflow.")]
    MathOverflow,
}

