use anchor_lang::prelude::*;

pub struct CommitReveal;

impl CommitReveal {
    pub fn verify_hash(_hash: &[u8; 32], _secret: &[u8], _player: &Pubkey, _room: &Pubkey) -> bool {
        false
    }
}

