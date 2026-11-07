use anchor_lang::prelude::*;

pub mod commit_reveal;
pub mod connect_four;
pub mod dice;
pub mod rps;
pub mod word_chain;

#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
pub enum Outcome {
    Continue,
    Win(u8), // player index 0 | 1
    Draw,
}

pub trait Game {
    fn is_skill() -> bool;
    fn init(state: &mut [u8], first_player: u8, now: i64) -> Result<()>;
    fn apply(state: &mut [u8], player: u8, data: &[u8], now: i64) -> Result<Outcome>;
    fn deadline_secs(state: &[u8]) -> i64;
    fn laggard(state: &[u8]) -> Option<u8>;
    fn flawless_win(_state: &[u8], _winner: u8) -> bool {
        false
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, AnchorSerialize, AnchorDeserialize)]
#[borsh(use_discriminant = true)]
#[repr(u8)]
pub enum GameKind {
    ConnectFour = 0,
    WordChain = 1,
    Rps = 2,
    Dice = 3,
}

impl GameKind {
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0 => Some(GameKind::ConnectFour),
            1 => Some(GameKind::WordChain),
            2 => Some(GameKind::Rps),
            3 => Some(GameKind::Dice),
            _ => None,
        }
    }
}

