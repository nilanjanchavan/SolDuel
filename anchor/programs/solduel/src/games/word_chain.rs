use anchor_lang::prelude::*;
use super::{Game, Outcome};
use crate::constants::WORD_CHAIN_TIMEOUT_SECS;

pub struct WordChain;

impl Game for WordChain {
    fn is_skill() -> bool {
        true
    }

    fn init(_state: &mut [u8], _first_player: u8, _now: i64) -> Result<()> {
        Ok(())
    }

    fn apply(_state: &mut [u8], _player: u8, _data: &[u8], _now: i64) -> Result<Outcome> {
        Ok(Outcome::Continue)
    }

    fn deadline_secs(_state: &[u8]) -> i64 {
        WORD_CHAIN_TIMEOUT_SECS
    }

    fn laggard(_state: &[u8]) -> Option<u8> {
        None
    }

    fn flawless_win(_state: &[u8], _winner: u8) -> bool {
        false
    }
}

