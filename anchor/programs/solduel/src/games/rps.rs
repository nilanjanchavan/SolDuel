use super::{
    commit_reveal::{
        CommitReveal, ACTION_TAG_COMMIT, ACTION_TAG_REVEAL, COMMIT_REVEAL_STATE_LEN,
        OFFSET_CHOICE_0, OFFSET_CHOICE_1, OFFSET_COMMIT_0, OFFSET_COMMIT_0_SET, OFFSET_COMMIT_1,
        OFFSET_COMMIT_1_SET, OFFSET_DRAW_COUNT, OFFSET_PHASE, OFFSET_REVEAL_0_SET,
        OFFSET_REVEAL_1_SET, OFFSET_ROOM, OFFSET_ROUND, OFFSET_SCORE_0, OFFSET_SCORE_1,
        PHASE_COMMIT, PHASE_REVEAL,
    },
    Game, Outcome,
};
use crate::constants::COMMIT_REVEAL_TIMEOUT_SECS;
use crate::errors::SolduelError;
use anchor_lang::prelude::*;

/// Best of 3 target wins
pub const TARGET_WINS: u8 = 2;

/// Maximum allowable drawn rounds before match terminates in Draw or leader win
pub const MAX_DRAWS: u8 = 5;

/// Hard cap on total played rounds
pub const MAX_TOTAL_ROUNDS: u8 = 9;

pub const RPS_ROCK: u8 = 0;
pub const RPS_PAPER: u8 = 1;
pub const RPS_SCISSORS: u8 = 2;

pub struct RockPaperScissors;

impl RockPaperScissors {
    /// Evaluates if choice_a beats choice_b:
    /// Rock (0) beats Scissors (2)
    /// Paper (1) beats Rock (0)
    /// Scissors (2) beats Paper (1)
    #[inline]
    pub fn beats(choice_a: u8, choice_b: u8) -> bool {
        (choice_a == RPS_ROCK && choice_b == RPS_SCISSORS)
            || (choice_a == RPS_PAPER && choice_b == RPS_ROCK)
            || (choice_a == RPS_SCISSORS && choice_b == RPS_PAPER)
    }
}

impl Game for RockPaperScissors {
    fn is_skill() -> bool {
        false
    }

    fn init(state: &mut [u8], _first_player: u8, _now: i64) -> Result<()> {
        if state.len() < COMMIT_REVEAL_STATE_LEN {
            return err!(SolduelError::MathOverflow);
        }
        state.fill(0);
        state[OFFSET_PHASE] = PHASE_COMMIT;
        state[OFFSET_CHOICE_0] = 255;
        state[OFFSET_CHOICE_1] = 255;
        Ok(())
    }

    fn apply(state: &mut [u8], player: u8, data: &[u8], _now: i64) -> Result<Outcome> {
        if state.len() < COMMIT_REVEAL_STATE_LEN {
            return err!(SolduelError::MathOverflow);
        }
        if player > 1 {
            return err!(SolduelError::NotAPlayer);
        }
        if data.is_empty() {
            return err!(SolduelError::ActionTimedOut);
        }

        let action_tag = data[0];
        let current_phase = state[OFFSET_PHASE];

        if action_tag == ACTION_TAG_COMMIT {
            // Must be in commit phase
            if current_phase != PHASE_COMMIT {
                return err!(SolduelError::NotYourTurn);
            }
            // Commit payload: [0, room(32), commit_hash(32)] = 65 bytes
            if data.len() < 65 {
                return err!(SolduelError::InvalidGame);
            }

            let mut action_room = [0u8; 32];
            action_room.copy_from_slice(&data[1..33]);

            let mut commit_hash = [0u8; 32];
            commit_hash.copy_from_slice(&data[33..65]);

            // If room is unset in state, set it from the first commit; otherwise verify matching room
            let is_room_set = state[OFFSET_ROUND] > 0
                || state[OFFSET_COMMIT_0_SET] == 1
                || state[OFFSET_COMMIT_1_SET] == 1;
            if !is_room_set {
                state[OFFSET_ROOM..OFFSET_ROOM + 32].copy_from_slice(&action_room);
            } else if state[OFFSET_ROOM..OFFSET_ROOM + 32] != action_room {
                return err!(SolduelError::InvalidGame);
            }

            if player == 0 {
                if state[OFFSET_COMMIT_0_SET] == 1 {
                    return err!(SolduelError::NotYourTurn); // Already committed
                }
                state[OFFSET_COMMIT_0..OFFSET_COMMIT_0 + 32].copy_from_slice(&commit_hash);
                state[OFFSET_COMMIT_0_SET] = 1;
            } else {
                if state[OFFSET_COMMIT_1_SET] == 1 {
                    return err!(SolduelError::NotYourTurn);
                }
                state[OFFSET_COMMIT_1..OFFSET_COMMIT_1 + 32].copy_from_slice(&commit_hash);
                state[OFFSET_COMMIT_1_SET] = 1;
            }

            // If both players committed, advance to Reveal phase
            if state[OFFSET_COMMIT_0_SET] == 1 && state[OFFSET_COMMIT_1_SET] == 1 {
                state[OFFSET_PHASE] = PHASE_REVEAL;
            }

            Ok(Outcome::Continue)
        } else if action_tag == ACTION_TAG_REVEAL {
            // Must be in reveal phase
            if current_phase != PHASE_REVEAL {
                return err!(SolduelError::NotYourTurn);
            }
            // Reveal payload: [1, choice(1), salt(32)] = 34 bytes
            if data.len() < 34 {
                // Malformed reveal forfeits
                return Ok(Outcome::Win(1 - player));
            }

            let choice = data[1];
            let mut salt = [0u8; 32];
            salt.copy_from_slice(&data[2..34]);

            // Validate choice in range (0 = Rock, 1 = Paper, 2 = Scissors)
            if choice > 2 {
                // Out of range choice forfeits
                return Ok(Outcome::Win(1 - player));
            }

            let mut room = [0u8; 32];
            room.copy_from_slice(&state[OFFSET_ROOM..OFFSET_ROOM + 32]);

            let mut expected_commit = [0u8; 32];
            if player == 0 {
                if state[OFFSET_REVEAL_0_SET] == 1 {
                    return err!(SolduelError::NotYourTurn); // Already revealed
                }
                expected_commit.copy_from_slice(&state[OFFSET_COMMIT_0..OFFSET_COMMIT_0 + 32]);
            } else {
                if state[OFFSET_REVEAL_1_SET] == 1 {
                    return err!(SolduelError::NotYourTurn);
                }
                expected_commit.copy_from_slice(&state[OFFSET_COMMIT_1..OFFSET_COMMIT_1 + 32]);
            }

            // Verify hash: mismatching reveal forfeits
            let valid = CommitReveal::verify_hash(&expected_commit, &room, player, choice, &salt);
            if !valid {
                return Ok(Outcome::Win(1 - player));
            }

            // Record verified reveal
            if player == 0 {
                state[OFFSET_REVEAL_0_SET] = 1;
                state[OFFSET_CHOICE_0] = choice;
            } else {
                state[OFFSET_REVEAL_1_SET] = 1;
                state[OFFSET_CHOICE_1] = choice;
            }

            // If both players have revealed, determine round outcome
            if state[OFFSET_REVEAL_0_SET] == 1 && state[OFFSET_REVEAL_1_SET] == 1 {
                let c0 = state[OFFSET_CHOICE_0];
                let c1 = state[OFFSET_CHOICE_1];

                if c0 == c1 {
                    // Tie / drawn round: replay drawn round with a cap
                    let draw_count = state[OFFSET_DRAW_COUNT].saturating_add(1);
                    state[OFFSET_DRAW_COUNT] = draw_count;

                    if draw_count >= MAX_DRAWS {
                        let s0 = state[OFFSET_SCORE_0];
                        let s1 = state[OFFSET_SCORE_1];
                        if s0 > s1 {
                            return Ok(Outcome::Win(0));
                        } else if s1 > s0 {
                            return Ok(Outcome::Win(1));
                        } else {
                            return Ok(Outcome::Draw);
                        }
                    }

                    state[OFFSET_ROUND] = state[OFFSET_ROUND].saturating_add(1);
                    CommitReveal::reset_round(state)?;
                    Ok(Outcome::Continue)
                } else if Self::beats(c0, c1) {
                    // Player 0 wins round
                    let s0 = state[OFFSET_SCORE_0].saturating_add(1);
                    state[OFFSET_SCORE_0] = s0;

                    if s0 >= TARGET_WINS {
                        return Ok(Outcome::Win(0));
                    }

                    state[OFFSET_ROUND] = state[OFFSET_ROUND].saturating_add(1);
                    if state[OFFSET_ROUND] >= MAX_TOTAL_ROUNDS {
                        let s1 = state[OFFSET_SCORE_1];
                        if s0 > s1 {
                            return Ok(Outcome::Win(0));
                        } else if s1 > s0 {
                            return Ok(Outcome::Win(1));
                        } else {
                            return Ok(Outcome::Draw);
                        }
                    }

                    CommitReveal::reset_round(state)?;
                    Ok(Outcome::Continue)
                } else {
                    // Player 1 wins round
                    let s1 = state[OFFSET_SCORE_1].saturating_add(1);
                    state[OFFSET_SCORE_1] = s1;

                    if s1 >= TARGET_WINS {
                        return Ok(Outcome::Win(1));
                    }

                    state[OFFSET_ROUND] = state[OFFSET_ROUND].saturating_add(1);
                    if state[OFFSET_ROUND] >= MAX_TOTAL_ROUNDS {
                        let s0 = state[OFFSET_SCORE_0];
                        if s1 > s0 {
                            return Ok(Outcome::Win(1));
                        } else if s0 > s1 {
                            return Ok(Outcome::Win(0));
                        } else {
                            return Ok(Outcome::Draw);
                        }
                    }

                    CommitReveal::reset_round(state)?;
                    Ok(Outcome::Continue)
                }
            } else {
                // Awaiting opponent's reveal
                Ok(Outcome::Continue)
            }
        } else {
            err!(SolduelError::InvalidGame)
        }
    }

    fn deadline_secs(_state: &[u8]) -> i64 {
        COMMIT_REVEAL_TIMEOUT_SECS
    }

    fn laggard(state: &[u8]) -> Option<u8> {
        CommitReveal::laggard(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_commit(room: &[u8; 32], hash: &[u8; 32]) -> Vec<u8> {
        let mut d = Vec::with_capacity(65);
        d.push(ACTION_TAG_COMMIT);
        d.extend_from_slice(room);
        d.extend_from_slice(hash);
        d
    }

    fn encode_reveal(choice: u8, salt: &[u8; 32]) -> Vec<u8> {
        let mut d = Vec::with_capacity(34);
        d.push(ACTION_TAG_REVEAL);
        d.push(choice);
        d.extend_from_slice(salt);
        d
    }

    #[test]
    fn test_rps_best_of_3_win() {
        let mut state = [0u8; 1024];
        RockPaperScissors::init(&mut state, 0, 0).unwrap();
        let room = [1u8; 32];
        let salt0 = [10u8; 32];
        let salt1 = [20u8; 32];

        // Round 1: P0 plays Rock (0), P1 plays Scissors (2) -> P0 wins round 1
        let hash0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
        let hash1 = CommitReveal::compute_hash(&room, 1, RPS_SCISSORS, &salt1);

        assert_eq!(
            RockPaperScissors::apply(&mut state, 0, &encode_commit(&room, &hash0), 0).unwrap(),
            Outcome::Continue
        );
        assert_eq!(
            RockPaperScissors::apply(&mut state, 1, &encode_commit(&room, &hash1), 0).unwrap(),
            Outcome::Continue
        );
        assert_eq!(
            RockPaperScissors::apply(&mut state, 0, &encode_reveal(RPS_ROCK, &salt0), 0).unwrap(),
            Outcome::Continue
        );
        assert_eq!(
            RockPaperScissors::apply(&mut state, 1, &encode_reveal(RPS_SCISSORS, &salt1), 0)
                .unwrap(),
            Outcome::Continue
        );
        assert_eq!(state[OFFSET_SCORE_0], 1);
        assert_eq!(state[OFFSET_SCORE_1], 0);

        // Round 2: P0 plays Paper (1), P1 plays Rock (0) -> P0 wins round 2 and takes the match!
        let hash0_r2 = CommitReveal::compute_hash(&room, 0, RPS_PAPER, &salt0);
        let hash1_r2 = CommitReveal::compute_hash(&room, 1, RPS_ROCK, &salt1);

        assert_eq!(
            RockPaperScissors::apply(&mut state, 0, &encode_commit(&room, &hash0_r2), 0).unwrap(),
            Outcome::Continue
        );
        assert_eq!(
            RockPaperScissors::apply(&mut state, 1, &encode_commit(&room, &hash1_r2), 0).unwrap(),
            Outcome::Continue
        );
        assert_eq!(
            RockPaperScissors::apply(&mut state, 0, &encode_reveal(RPS_PAPER, &salt0), 0).unwrap(),
            Outcome::Continue
        );
        let outcome =
            RockPaperScissors::apply(&mut state, 1, &encode_reveal(RPS_ROCK, &salt1), 0).unwrap();
        assert_eq!(outcome, Outcome::Win(0));
        assert_eq!(state[OFFSET_SCORE_0], 2);
    }

    #[test]
    fn test_rps_mismatching_reveal_forfeits() {
        let mut state = [0u8; 1024];
        RockPaperScissors::init(&mut state, 0, 0).unwrap();
        let room = [2u8; 32];
        let salt0 = [10u8; 32];
        let salt1 = [20u8; 32];

        // P0 commits Rock
        let hash0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
        let hash1 = CommitReveal::compute_hash(&room, 1, RPS_PAPER, &salt1);

        RockPaperScissors::apply(&mut state, 0, &encode_commit(&room, &hash0), 0).unwrap();
        RockPaperScissors::apply(&mut state, 1, &encode_commit(&room, &hash1), 0).unwrap();

        // P0 attempts to reveal Scissors instead of Rock with same salt -> Hash mismatch -> Forfeit!
        let outcome =
            RockPaperScissors::apply(&mut state, 0, &encode_reveal(RPS_SCISSORS, &salt0), 0)
                .unwrap();
        assert_eq!(outcome, Outcome::Win(1));
    }

    #[test]
    fn test_rps_malformed_and_edge_inputs() {
        let mut state = [0u8; 1024];
        RockPaperScissors::init(&mut state, 0, 0).unwrap();
        let room = [3u8; 32];
        let salt = [5u8; 32];

        // 1. Invalid player
        assert!(RockPaperScissors::apply(&mut state, 2, &[0], 0).is_err());

        // 2. Empty data
        assert!(RockPaperScissors::apply(&mut state, 0, &[], 0).is_err());

        // 3. Short commit payload (< 65 bytes)
        assert!(RockPaperScissors::apply(&mut state, 0, &[ACTION_TAG_COMMIT, 1, 2], 0).is_err());

        // 4. Reveal during commit phase
        assert!(
            RockPaperScissors::apply(&mut state, 0, &encode_reveal(RPS_ROCK, &salt), 0).is_err()
        );

        // Valid commits from both players
        let h0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt);
        let h1 = CommitReveal::compute_hash(&room, 1, RPS_SCISSORS, &salt);
        assert_eq!(
            RockPaperScissors::apply(&mut state, 0, &encode_commit(&room, &h0), 0).unwrap(),
            Outcome::Continue
        );

        // 5. Double commit by player 0
        assert!(RockPaperScissors::apply(&mut state, 0, &encode_commit(&room, &h0), 0).is_err());

        // 6. Commit with mismatched room
        let other_room = [9u8; 32];
        assert!(
            RockPaperScissors::apply(&mut state, 1, &encode_commit(&other_room, &h1), 0).is_err()
        );

        // Valid player 1 commit -> advances to reveal phase
        assert_eq!(
            RockPaperScissors::apply(&mut state, 1, &encode_commit(&room, &h1), 0).unwrap(),
            Outcome::Continue
        );

        // 7. Commit during reveal phase
        assert!(RockPaperScissors::apply(&mut state, 0, &encode_commit(&room, &h0), 0).is_err());

        // 8. Reveal payload too short (< 34 bytes) forfeits
        let short_reveal = vec![ACTION_TAG_REVEAL, RPS_ROCK];
        let out_short = RockPaperScissors::apply(&mut state, 0, &short_reveal, 0).unwrap();
        assert_eq!(out_short, Outcome::Win(1));

        // Reset for choice > 2 check
        RockPaperScissors::init(&mut state, 0, 0).unwrap();
        RockPaperScissors::apply(&mut state, 0, &encode_commit(&room, &h0), 0).unwrap();
        RockPaperScissors::apply(&mut state, 1, &encode_commit(&room, &h1), 0).unwrap();

        // 9. Choice > 2 (e.g. 5) forfeits
        let out_invalid_choice =
            RockPaperScissors::apply(&mut state, 0, &encode_reveal(5, &salt), 0).unwrap();
        assert_eq!(out_invalid_choice, Outcome::Win(1));
    }

    fn find_vectors_dir() -> std::path::PathBuf {
        let candidates = [
            std::path::PathBuf::from("../../../tests/vectors"),
            std::path::PathBuf::from("../../tests/vectors"),
            std::path::PathBuf::from("../tests/vectors"),
            std::path::PathBuf::from("tests/vectors"),
        ];
        for candidate in &candidates {
            if candidate.exists() && candidate.is_dir() {
                return candidate.clone();
            }
        }
        panic!("tests/vectors directory not found");
    }

    #[derive(serde::Serialize, serde::Deserialize, Debug)]
    struct VectorRecord {
        players: Vec<String>,
        actions: Vec<String>,
        expected_outcome: serde_json::Value,
        final_state_hex: String,
    }

    #[test]
    #[ignore]
    fn generate_rps_vectors() {
        let p0 = "11111111111111111111111111111111".to_string();
        let p1 = "22222222222222222222222222222222".to_string();
        let room = [0xAAu8; 32];
        let salt0 = [0x10u8; 32];
        let salt1 = [0x20u8; 32];

        let mut vectors = Vec::new();

        // Vector 1: Player 0 wins best of 3 (2-0)
        {
            let mut state = [0u8; 1024];
            RockPaperScissors::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            // Round 1: P0 Rock (0), P1 Scissors (2)
            let h0_r1 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
            let h1_r1 = CommitReveal::compute_hash(&room, 1, RPS_SCISSORS, &salt1);
            let a0 = encode_commit(&room, &h0_r1);
            let a1 = encode_commit(&room, &h1_r1);
            let a2 = encode_reveal(RPS_ROCK, &salt0);
            let a3 = encode_reveal(RPS_SCISSORS, &salt1);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));
            actions.push(hex::encode(&a3));

            RockPaperScissors::apply(&mut state, 0, &a0, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a1, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 0, &a2, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a3, 1000).unwrap();

            // Round 2: P0 Paper (1), P1 Rock (0)
            let h0_r2 = CommitReveal::compute_hash(&room, 0, RPS_PAPER, &salt0);
            let h1_r2 = CommitReveal::compute_hash(&room, 1, RPS_ROCK, &salt1);
            let a4 = encode_commit(&room, &h0_r2);
            let a5 = encode_commit(&room, &h1_r2);
            let a6 = encode_reveal(RPS_PAPER, &salt0);
            let a7 = encode_reveal(RPS_ROCK, &salt1);
            actions.push(hex::encode(&a4));
            actions.push(hex::encode(&a5));
            actions.push(hex::encode(&a6));
            actions.push(hex::encode(&a7));

            RockPaperScissors::apply(&mut state, 0, &a4, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a5, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 0, &a6, 1000).unwrap();
            let out = RockPaperScissors::apply(&mut state, 1, &a7, 1000).unwrap();
            assert_eq!(out, Outcome::Win(0));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 0 }),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 2: Player 1 wins after a round tie (tie, P1 win, P1 win)
        {
            let mut state = [0u8; 1024];
            RockPaperScissors::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            // Round 1: Rock vs Rock (tie)
            let h0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, RPS_ROCK, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            let a2 = encode_reveal(RPS_ROCK, &salt0);
            let a3 = encode_reveal(RPS_ROCK, &salt1);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));
            actions.push(hex::encode(&a3));
            RockPaperScissors::apply(&mut state, 0, &a0, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a1, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 0, &a2, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a3, 1000).unwrap();

            // Round 2: Rock vs Paper (P1 wins)
            let h0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, RPS_PAPER, &salt1);
            let a4 = encode_commit(&room, &h0);
            let a5 = encode_commit(&room, &h1);
            let a6 = encode_reveal(RPS_ROCK, &salt0);
            let a7 = encode_reveal(RPS_PAPER, &salt1);
            actions.push(hex::encode(&a4));
            actions.push(hex::encode(&a5));
            actions.push(hex::encode(&a6));
            actions.push(hex::encode(&a7));
            RockPaperScissors::apply(&mut state, 0, &a4, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a5, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 0, &a6, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a7, 1000).unwrap();

            // Round 3: Scissors vs Rock (P1 wins match)
            let h0 = CommitReveal::compute_hash(&room, 0, RPS_SCISSORS, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, RPS_ROCK, &salt1);
            let a8 = encode_commit(&room, &h0);
            let a9 = encode_commit(&room, &h1);
            let a10 = encode_reveal(RPS_SCISSORS, &salt0);
            let a11 = encode_reveal(RPS_ROCK, &salt1);
            actions.push(hex::encode(&a8));
            actions.push(hex::encode(&a9));
            actions.push(hex::encode(&a10));
            actions.push(hex::encode(&a11));
            RockPaperScissors::apply(&mut state, 0, &a8, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a9, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 0, &a10, 1000).unwrap();
            let out = RockPaperScissors::apply(&mut state, 1, &a11, 1000).unwrap();
            assert_eq!(out, Outcome::Win(1));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 1 }),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 3: In-progress match (continue)
        {
            let mut state = [0u8; 1024];
            RockPaperScissors::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let h0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, RPS_PAPER, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            let a2 = encode_reveal(RPS_ROCK, &salt0);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));

            RockPaperScissors::apply(&mut state, 0, &a0, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a1, 1000).unwrap();
            let out = RockPaperScissors::apply(&mut state, 0, &a2, 1000).unwrap();
            assert_eq!(out, Outcome::Continue);

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!("continue"),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 4: 5 ties reaching MAX_DRAWS -> draw
        {
            let mut state = [0u8; 1024];
            RockPaperScissors::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let mut out = Outcome::Continue;
            for _ in 0..5 {
                let h0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
                let h1 = CommitReveal::compute_hash(&room, 1, RPS_ROCK, &salt1);
                let a0 = encode_commit(&room, &h0);
                let a1 = encode_commit(&room, &h1);
                let a2 = encode_reveal(RPS_ROCK, &salt0);
                let a3 = encode_reveal(RPS_ROCK, &salt1);
                actions.push(hex::encode(&a0));
                actions.push(hex::encode(&a1));
                actions.push(hex::encode(&a2));
                actions.push(hex::encode(&a3));

                RockPaperScissors::apply(&mut state, 0, &a0, 1000).unwrap();
                RockPaperScissors::apply(&mut state, 1, &a1, 1000).unwrap();
                RockPaperScissors::apply(&mut state, 0, &a2, 1000).unwrap();
                out = RockPaperScissors::apply(&mut state, 1, &a3, 1000).unwrap();
            }
            assert_eq!(out, Outcome::Draw);

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!("draw"),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 5: Mismatching reveal forfeits -> Win(1)
        {
            let mut state = [0u8; 1024];
            RockPaperScissors::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let h0 = CommitReveal::compute_hash(&room, 0, RPS_ROCK, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, RPS_PAPER, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            // P0 reveals Scissors instead of Rock with salt0
            let a2 = encode_reveal(RPS_SCISSORS, &salt0);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));

            RockPaperScissors::apply(&mut state, 0, &a0, 1000).unwrap();
            RockPaperScissors::apply(&mut state, 1, &a1, 1000).unwrap();
            let out = RockPaperScissors::apply(&mut state, 0, &a2, 1000).unwrap();
            assert_eq!(out, Outcome::Win(1));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 1 }),
                final_state_hex: hex::encode(&state),
            });
        }

        let dir = find_vectors_dir();
        let target = dir.join("rps.json");
        let json = serde_json::to_string_pretty(&vectors).unwrap();
        std::fs::write(&target, json).expect("Failed to write rps.json");
    }

    #[test]
    fn test_rps_vectors() {
        let dir = find_vectors_dir();
        let file = dir.join("rps.json");
        assert!(file.exists(), "Vector file {} must exist", file.display());
        let data = std::fs::read_to_string(&file).unwrap();
        let vectors: Vec<VectorRecord> = serde_json::from_str(&data).unwrap();

        for (idx, vec) in vectors.iter().enumerate() {
            let mut state = [0u8; 1024];
            RockPaperScissors::init(&mut state, 0, 1000).unwrap();

            let mut last_outcome = Outcome::Continue;
            let mut current_player = 0u8;

            for action_hex in &vec.actions {
                let action_bytes = hex::decode(action_hex).unwrap();
                last_outcome =
                    RockPaperScissors::apply(&mut state, current_player, &action_bytes, 1000)
                        .unwrap();
                current_player = 1 - current_player;
            }

            let expected_str = vec.expected_outcome.to_string();
            match last_outcome {
                Outcome::Continue => assert_eq!(
                    expected_str, "\"continue\"",
                    "Vector #{} outcome mismatch",
                    idx
                ),
                Outcome::Win(w) => assert_eq!(
                    expected_str,
                    format!("{{\"win\":{}}}", w),
                    "Vector #{} outcome mismatch",
                    idx
                ),
                Outcome::Draw => {
                    assert_eq!(expected_str, "\"draw\"", "Vector #{} outcome mismatch", idx)
                }
            }

            assert_eq!(
                hex::encode(&state),
                vec.final_state_hex,
                "Vector #{} final state mismatch",
                idx
            );
        }
    }
}
