use anchor_lang::prelude::*;
use crate::errors::SolduelError;
use crate::MintBadge;

pub fn handle_mint_badge(_ctx: Context<MintBadge>, _badge: u8) -> Result<()> {
    err!(SolduelError::NotImplemented)
}
