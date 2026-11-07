use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

pub const OFFSET_ROOM: usize = 0; // 32 bytes: MatchRoom pubkey
pub const OFFSET_ROUND: usize = 32; // 1 byte
pub const OFFSET_PHASE: usize = 33; // 1 byte: 0 = Commit, 1 = Reveal
pub const OFFSET_COMMIT_0_SET: usize = 34; // 1 byte: 0 = no, 1 = yes
pub const OFFSET_COMMIT_1_SET: usize = 35; // 1 byte: 0 = no, 1 = yes
pub const OFFSET_COMMIT_0: usize = 36; // 32 bytes
pub const OFFSET_COMMIT_1: usize = 68; // 32 bytes
pub const OFFSET_REVEAL_0_SET: usize = 100; // 1 byte: 0 = no, 1 = yes
pub const OFFSET_REVEAL_1_SET: usize = 101; // 1 byte: 0 = no, 1 = yes
pub const OFFSET_CHOICE_0: usize = 102; // 1 byte
pub const OFFSET_CHOICE_1: usize = 103; // 1 byte
pub const OFFSET_SCORE_0: usize = 104; // 1 byte
pub const OFFSET_SCORE_1: usize = 105; // 1 byte
pub const OFFSET_DRAW_COUNT: usize = 106; // 1 byte
pub const COMMIT_REVEAL_STATE_LEN: usize = 107;

pub const PHASE_COMMIT: u8 = 0;
pub const PHASE_REVEAL: u8 = 1;

pub const ACTION_TAG_COMMIT: u8 = 0;
pub const ACTION_TAG_REVEAL: u8 = 1;

pub struct CommitReveal;

impl CommitReveal {
    /// Computes the SHA-256 commit hash binding room, player index, choice, and 32-byte salt.
    /// Preimage: `room || player || choice || salt` (66 bytes total).
    pub fn compute_hash(room: &[u8; 32], player: u8, choice: u8, salt: &[u8; 32]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(room);
        hasher.update(&[player, choice]);
        hasher.update(salt);
        hasher.finalize().into()
    }

    /// Verifies that a reveal matches the committed hash.
    pub fn verify_hash(
        expected_hash: &[u8; 32],
        room: &[u8; 32],
        player: u8,
        choice: u8,
        salt: &[u8; 32],
    ) -> bool {
        let computed = Self::compute_hash(room, player, choice, salt);
        &computed == expected_hash
    }

    /// Determines who is holding up the game when a timeout occurs.
    /// In Commit phase: the uncommitted player is laggard (None if both uncommitted).
    /// In Reveal phase: the unrevealed player is laggard (None if both unrevealed).
    pub fn laggard(state: &[u8]) -> Option<u8> {
        if state.len() < COMMIT_REVEAL_STATE_LEN {
            return None;
        }

        let phase = state[OFFSET_PHASE];
        if phase == PHASE_COMMIT {
            let c0 = state[OFFSET_COMMIT_0_SET] == 1;
            let c1 = state[OFFSET_COMMIT_1_SET] == 1;
            match (c0, c1) {
                (true, false) => Some(1),
                (false, true) => Some(0),
                _ => None,
            }
        } else if phase == PHASE_REVEAL {
            let r0 = state[OFFSET_REVEAL_0_SET] == 1;
            let r1 = state[OFFSET_REVEAL_1_SET] == 1;
            match (r0, r1) {
                (true, false) => Some(1),
                (false, true) => Some(0),
                _ => None,
            }
        } else {
            None
        }
    }

    /// Resets commits and reveals in preparation for a subsequent round.
    pub fn reset_round(state: &mut [u8]) {
        state[OFFSET_PHASE] = PHASE_COMMIT;
        state[OFFSET_COMMIT_0_SET] = 0;
        state[OFFSET_COMMIT_1_SET] = 0;
        state[OFFSET_COMMIT_0..OFFSET_COMMIT_0 + 32].fill(0);
        state[OFFSET_COMMIT_1..OFFSET_COMMIT_1 + 32].fill(0);
        state[OFFSET_REVEAL_0_SET] = 0;
        state[OFFSET_REVEAL_1_SET] = 0;
        state[OFFSET_CHOICE_0] = 255;
        state[OFFSET_CHOICE_1] = 255;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_and_verify_hash() {
        let room = [7u8; 32];
        let salt = [42u8; 32];
        let hash = CommitReveal::compute_hash(&room, 0, 1, &salt);

        assert!(CommitReveal::verify_hash(&hash, &room, 0, 1, &salt));
        // Wrong player
        assert!(!CommitReveal::verify_hash(&hash, &room, 1, 1, &salt));
        // Wrong choice
        assert!(!CommitReveal::verify_hash(&hash, &room, 0, 2, &salt));
        // Wrong salt
        let bad_salt = [43u8; 32];
        assert!(!CommitReveal::verify_hash(&hash, &room, 0, 1, &bad_salt));
        // Wrong room
        let bad_room = [8u8; 32];
        assert!(!CommitReveal::verify_hash(&hash, &bad_room, 0, 1, &salt));
    }

    #[test]
    fn test_laggard_detection() {
        let mut state = [0u8; 1024];
        state[OFFSET_PHASE] = PHASE_COMMIT;

        // Neither committed
        assert_eq!(CommitReveal::laggard(&state), None);

        // Player 0 committed, player 1 not
        state[OFFSET_COMMIT_0_SET] = 1;
        assert_eq!(CommitReveal::laggard(&state), Some(1));

        // Player 1 committed, player 0 not
        state[OFFSET_COMMIT_0_SET] = 0;
        state[OFFSET_COMMIT_1_SET] = 1;
        assert_eq!(CommitReveal::laggard(&state), Some(0));

        // Both committed
        state[OFFSET_COMMIT_0_SET] = 1;
        assert_eq!(CommitReveal::laggard(&state), None);

        // Advance to reveal phase
        state[OFFSET_PHASE] = PHASE_REVEAL;
        assert_eq!(CommitReveal::laggard(&state), None);

        // Player 0 revealed, player 1 not
        state[OFFSET_REVEAL_0_SET] = 1;
        assert_eq!(CommitReveal::laggard(&state), Some(1));

        // Both revealed
        state[OFFSET_REVEAL_1_SET] = 1;
        assert_eq!(CommitReveal::laggard(&state), None);
    }
}
