use anchor_lang::prelude::*;
use super::{Game, Outcome};
use crate::constants::COMMIT_REVEAL_TIMEOUT_SECS;

pub struct DiceDuel;

impl Game for DiceDuel {
    fn is_skill() -> bool {
        false
    }

    fn init(_state: &mut [u8], _first_player: u8, _now: i64) -> Result<()> {
        Ok(())
    }

    fn apply(_state: &mut [u8], _player: u8, _data: &[u8], _now: i64) -> Result<Outcome> {
        Ok(Outcome::Continue)
    }

    fn deadline_secs(_state: &[u8]) -> i64 {
        COMMIT_REVEAL_TIMEOUT_SECS
    }

    fn laggard(_state: &[u8]) -> Option<u8> {
        None
    }
}

