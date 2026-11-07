use anchor_lang::prelude::*;
use crate::errors::SolduelError;
use crate::MintBadge;

/// Handles minting a profile achievement badge as a soulbound NFT.
pub fn handle_mint_badge(_ctx: Context<MintBadge>, _badge: u8) -> Result<()> {
    err!(SolduelError::NotImplemented)
}
