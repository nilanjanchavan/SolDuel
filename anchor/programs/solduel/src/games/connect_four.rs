use anchor_lang::prelude::*;
use super::{Game, Outcome};
use crate::constants::CONNECT_FOUR_TIMEOUT_SECS;
use crate::errors::SolduelError;

pub const COLS: usize = 7;
pub const ROWS: usize = 6;
pub const BOARD_SIZE: usize = COLS * ROWS; // 42

/// Connect Four on-chain game implementation: 7x6 board with gravity.
pub struct ConnectFour;

impl ConnectFour {
    /// Computes the linear buffer index for a board cell at (`col`, `row`).
    #[inline]
    pub fn board_index(col: usize, row: usize) -> usize {
        4 + col * ROWS + row
    }

    /// Checks if placing `piece` at (`col`, `row`) completes four in a row in any direction.
    pub fn check_win(state: &[u8], col: usize, row: usize, piece: u8) -> bool {
        let directions = [(1isize, 0isize), (0, 1), (1, 1), (1, -1)];

        for (dc, dr) in directions {
            let mut count = 1;

            // Forward
            let mut c = col as isize + dc;
            let mut r = row as isize + dr;
            while c >= 0 && c < COLS as isize && r >= 0 && r < ROWS as isize {
                if state[Self::board_index(c as usize, r as usize)] == piece {
                    count += 1;
                    c += dc;
                    r += dr;
                } else {
                    break;
                }
            }

            // Backward
            c = col as isize - dc;
            r = row as isize - dr;
            while c >= 0 && c < COLS as isize && r >= 0 && r < ROWS as isize {
                if state[Self::board_index(c as usize, r as usize)] == piece {
                    count += 1;
                    c -= dc;
                    r -= dr;
                } else {
                    break;
                }
            }

            if count >= 4 {
                return true;
            }
        }

        false
    }
}

impl Game for ConnectFour {
    fn is_skill() -> bool {
        true
    }

    fn init(state: &mut [u8], first_player: u8, _now: i64) -> Result<()> {
        if state.len() < 4 + BOARD_SIZE {
            return err!(SolduelError::MathOverflow);
        }
        state.fill(0);
        state[0] = first_player & 1; // current turn: 0 or 1
        state[1] = 0; // move count
        state[2] = 255; // last move col
        state[3] = 255; // last move row
        Ok(())
    }

    fn apply(state: &mut [u8], player: u8, data: &[u8], _now: i64) -> Result<Outcome> {
        if state.len() < 4 + BOARD_SIZE {
            return err!(SolduelError::MathOverflow);
        }

        // Validate turn
        if state[0] != player {
            return err!(SolduelError::NotYourTurn);
        }

        // Validate action data: data[0] is col index (0..6)
        if data.is_empty() {
            return err!(SolduelError::ActionTimedOut);
        }
        let col = data[0] as usize;
        if col >= COLS {
            return err!(SolduelError::InvalidGame);
        }

        // Find lowest open row in selected column
        let mut target_row = None;
        for r in 0..ROWS {
            let idx = Self::board_index(col, r);
            if state[idx] == 0 {
                target_row = Some(r);
                break;
            }
        }

        let row = match target_row {
            Some(r) => r,
            None => return err!(SolduelError::InvalidGame), // Column full
        };

        // Piece value: 1 for player 0, 2 for player 1
        let piece = player + 1;
        state[Self::board_index(col, row)] = piece;
        state[1] = state[1].saturating_add(1);
        state[2] = col as u8;
        state[3] = row as u8;

        // Check win
        if Self::check_win(state, col, row, piece) {
            return Ok(Outcome::Win(player));
        }

        // Check draw (board full: 42 moves)
        if state[1] as usize >= BOARD_SIZE {
            return Ok(Outcome::Draw);
        }

        // Next player turn
        state[0] = 1 - player;
        Ok(Outcome::Continue)
    }

    fn deadline_secs(_state: &[u8]) -> i64 {
        CONNECT_FOUR_TIMEOUT_SECS
    }

    fn laggard(state: &[u8]) -> Option<u8> {
        if state.is_empty() {
            None
        } else {
            Some(state[0] & 1)
        }
    }
}
