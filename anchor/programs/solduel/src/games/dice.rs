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

/// Maximum allowable drawn rounds before duel terminates in a Draw
pub const MAX_DRAWS: u8 = 5;

pub struct DiceDuel;

impl Game for DiceDuel {
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
            let mut stored_room = [0u8; 32];
            stored_room.copy_from_slice(&state[OFFSET_ROOM..OFFSET_ROOM + 32]);
            if stored_room == [0u8; 32] {
                state[OFFSET_ROOM..OFFSET_ROOM + 32].copy_from_slice(&action_room);
            } else if stored_room != action_room {
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

            // Validate choice is a valid 6-sided die roll (1..=6)
            if choice < 1 || choice > 6 {
                // Invalid choice forfeits
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

            // Record verified reveal and roll
            if player == 0 {
                state[OFFSET_REVEAL_0_SET] = 1;
                state[OFFSET_CHOICE_0] = choice;
                state[OFFSET_SCORE_0] = choice;
            } else {
                state[OFFSET_REVEAL_1_SET] = 1;
                state[OFFSET_CHOICE_1] = choice;
                state[OFFSET_SCORE_1] = choice;
            }

            // If both players have revealed, evaluate the duel
            if state[OFFSET_REVEAL_0_SET] == 1 && state[OFFSET_REVEAL_1_SET] == 1 {
                let r0 = state[OFFSET_CHOICE_0];
                let r1 = state[OFFSET_CHOICE_1];

                if r0 > r1 {
                    // Player 0 rolled higher
                    Ok(Outcome::Win(0))
                } else if r1 > r0 {
                    // Player 1 rolled higher
                    Ok(Outcome::Win(1))
                } else {
                    // Tied rolls: replay drawn round with a cap
                    let draw_count = state[OFFSET_DRAW_COUNT].saturating_add(1);
                    state[OFFSET_DRAW_COUNT] = draw_count;

                    if draw_count >= MAX_DRAWS {
                        return Ok(Outcome::Draw);
                    }

                    state[OFFSET_ROUND] = state[OFFSET_ROUND].saturating_add(1);
                    CommitReveal::reset_round(state);
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
    fn test_dice_duel_win() {
        let mut state = [0u8; 1024];
        DiceDuel::init(&mut state, 0, 0).unwrap();
        let room = [3u8; 32];
        let salt0 = [10u8; 32];
        let salt1 = [20u8; 32];

        // P0 rolls 6, P1 rolls 4 -> P0 wins
        let hash0 = CommitReveal::compute_hash(&room, 0, 6, &salt0);
        let hash1 = CommitReveal::compute_hash(&room, 1, 4, &salt1);

        DiceDuel::apply(&mut state, 0, &encode_commit(&room, &hash0), 0).unwrap();
        DiceDuel::apply(&mut state, 1, &encode_commit(&room, &hash1), 0).unwrap();

        DiceDuel::apply(&mut state, 0, &encode_reveal(6, &salt0), 0).unwrap();
        let outcome = DiceDuel::apply(&mut state, 1, &encode_reveal(4, &salt1), 0).unwrap();
        assert_eq!(outcome, Outcome::Win(0));
        assert_eq!(state[OFFSET_SCORE_0], 6);
        assert_eq!(state[OFFSET_SCORE_1], 4);
    }

    #[test]
    fn test_dice_tie_and_replay() {
        let mut state = [0u8; 1024];
        DiceDuel::init(&mut state, 0, 0).unwrap();
        let room = [4u8; 32];
        let salt0 = [10u8; 32];
        let salt1 = [20u8; 32];

        // Round 1: Both roll 5 -> Tie -> Continue
        let hash0 = CommitReveal::compute_hash(&room, 0, 5, &salt0);
        let hash1 = CommitReveal::compute_hash(&room, 1, 5, &salt1);

        DiceDuel::apply(&mut state, 0, &encode_commit(&room, &hash0), 0).unwrap();
        DiceDuel::apply(&mut state, 1, &encode_commit(&room, &hash1), 0).unwrap();

        DiceDuel::apply(&mut state, 0, &encode_reveal(5, &salt0), 0).unwrap();
        let outcome1 = DiceDuel::apply(&mut state, 1, &encode_reveal(5, &salt1), 0).unwrap();
        assert_eq!(outcome1, Outcome::Continue);
        assert_eq!(state[OFFSET_DRAW_COUNT], 1);
        assert_eq!(state[OFFSET_ROUND], 1);

        // Round 2: P1 rolls 6, P0 rolls 2 -> P1 wins
        let hash0_r2 = CommitReveal::compute_hash(&room, 0, 2, &salt0);
        let hash1_r2 = CommitReveal::compute_hash(&room, 1, 6, &salt1);

        DiceDuel::apply(&mut state, 0, &encode_commit(&room, &hash0_r2), 0).unwrap();
        DiceDuel::apply(&mut state, 1, &encode_commit(&room, &hash1_r2), 0).unwrap();

        DiceDuel::apply(&mut state, 0, &encode_reveal(2, &salt0), 0).unwrap();
        let outcome2 = DiceDuel::apply(&mut state, 1, &encode_reveal(6, &salt1), 0).unwrap();
        assert_eq!(outcome2, Outcome::Win(1));
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
    fn generate_dice_vectors() {
        let p0 = "11111111111111111111111111111111".to_string();
        let p1 = "22222222222222222222222222222222".to_string();
        let room = [0xBBu8; 32];
        let salt0 = [0x10u8; 32];
        let salt1 = [0x20u8; 32];

        let mut vectors = Vec::new();

        // Vector 1: P0 rolls 6 vs P1 rolls 4 -> Win(0)
        {
            let mut state = [0u8; 1024];
            DiceDuel::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let h0 = CommitReveal::compute_hash(&room, 0, 6, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, 4, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            let a2 = encode_reveal(6, &salt0);
            let a3 = encode_reveal(4, &salt1);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));
            actions.push(hex::encode(&a3));

            DiceDuel::apply(&mut state, 0, &a0, 1000).unwrap();
            DiceDuel::apply(&mut state, 1, &a1, 1000).unwrap();
            DiceDuel::apply(&mut state, 0, &a2, 1000).unwrap();
            let out = DiceDuel::apply(&mut state, 1, &a3, 1000).unwrap();
            assert_eq!(out, Outcome::Win(0));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 0 }),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 2: P0 rolls 2 vs P1 rolls 5 -> Win(1)
        {
            let mut state = [0u8; 1024];
            DiceDuel::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let h0 = CommitReveal::compute_hash(&room, 0, 2, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, 5, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            let a2 = encode_reveal(2, &salt0);
            let a3 = encode_reveal(5, &salt1);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));
            actions.push(hex::encode(&a3));

            DiceDuel::apply(&mut state, 0, &a0, 1000).unwrap();
            DiceDuel::apply(&mut state, 1, &a1, 1000).unwrap();
            DiceDuel::apply(&mut state, 0, &a2, 1000).unwrap();
            let out = DiceDuel::apply(&mut state, 1, &a3, 1000).unwrap();
            assert_eq!(out, Outcome::Win(1));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 1 }),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 3: Round 1 tie (both roll 5) followed by Round 2 P0 rolls 6 vs P1 rolls 3 -> Win(0)
        {
            let mut state = [0u8; 1024];
            DiceDuel::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            // Round 1: Both 5
            let h0 = CommitReveal::compute_hash(&room, 0, 5, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, 5, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            let a2 = encode_reveal(5, &salt0);
            let a3 = encode_reveal(5, &salt1);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));
            actions.push(hex::encode(&a3));

            DiceDuel::apply(&mut state, 0, &a0, 1000).unwrap();
            DiceDuel::apply(&mut state, 1, &a1, 1000).unwrap();
            DiceDuel::apply(&mut state, 0, &a2, 1000).unwrap();
            let out1 = DiceDuel::apply(&mut state, 1, &a3, 1000).unwrap();
            assert_eq!(out1, Outcome::Continue);

            // Round 2: 6 vs 3
            let h0 = CommitReveal::compute_hash(&room, 0, 6, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, 3, &salt1);
            let a4 = encode_commit(&room, &h0);
            let a5 = encode_commit(&room, &h1);
            let a6 = encode_reveal(6, &salt0);
            let a7 = encode_reveal(3, &salt1);
            actions.push(hex::encode(&a4));
            actions.push(hex::encode(&a5));
            actions.push(hex::encode(&a6));
            actions.push(hex::encode(&a7));

            DiceDuel::apply(&mut state, 0, &a4, 1000).unwrap();
            DiceDuel::apply(&mut state, 1, &a5, 1000).unwrap();
            DiceDuel::apply(&mut state, 0, &a6, 1000).unwrap();
            let out2 = DiceDuel::apply(&mut state, 1, &a7, 1000).unwrap();
            assert_eq!(out2, Outcome::Win(0));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 0 }),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 4: In-progress match (continue)
        {
            let mut state = [0u8; 1024];
            DiceDuel::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let h0 = CommitReveal::compute_hash(&room, 0, 4, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, 2, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            let a2 = encode_reveal(4, &salt0);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));

            DiceDuel::apply(&mut state, 0, &a0, 1000).unwrap();
            DiceDuel::apply(&mut state, 1, &a1, 1000).unwrap();
            let out = DiceDuel::apply(&mut state, 0, &a2, 1000).unwrap();
            assert_eq!(out, Outcome::Continue);

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!("continue"),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 5: 5 ties reaching MAX_DRAWS -> draw
        {
            let mut state = [0u8; 1024];
            DiceDuel::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let mut out = Outcome::Continue;
            for _ in 0..5 {
                let h0 = CommitReveal::compute_hash(&room, 0, 4, &salt0);
                let h1 = CommitReveal::compute_hash(&room, 1, 4, &salt1);
                let a0 = encode_commit(&room, &h0);
                let a1 = encode_commit(&room, &h1);
                let a2 = encode_reveal(4, &salt0);
                let a3 = encode_reveal(4, &salt1);
                actions.push(hex::encode(&a0));
                actions.push(hex::encode(&a1));
                actions.push(hex::encode(&a2));
                actions.push(hex::encode(&a3));

                DiceDuel::apply(&mut state, 0, &a0, 1000).unwrap();
                DiceDuel::apply(&mut state, 1, &a1, 1000).unwrap();
                DiceDuel::apply(&mut state, 0, &a2, 1000).unwrap();
                out = DiceDuel::apply(&mut state, 1, &a3, 1000).unwrap();
            }
            assert_eq!(out, Outcome::Draw);

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!("draw"),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 6: Mismatching reveal forfeits -> Win(1)
        {
            let mut state = [0u8; 1024];
            DiceDuel::init(&mut state, 0, 1000).unwrap();
            let mut actions = Vec::new();

            let h0 = CommitReveal::compute_hash(&room, 0, 6, &salt0);
            let h1 = CommitReveal::compute_hash(&room, 1, 4, &salt1);
            let a0 = encode_commit(&room, &h0);
            let a1 = encode_commit(&room, &h1);
            // P0 reveals 5 instead of 6 with salt0
            let a2 = encode_reveal(5, &salt0);
            actions.push(hex::encode(&a0));
            actions.push(hex::encode(&a1));
            actions.push(hex::encode(&a2));

            DiceDuel::apply(&mut state, 0, &a0, 1000).unwrap();
            DiceDuel::apply(&mut state, 1, &a1, 1000).unwrap();
            let out = DiceDuel::apply(&mut state, 0, &a2, 1000).unwrap();
            assert_eq!(out, Outcome::Win(1));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 1 }),
                final_state_hex: hex::encode(&state),
            });
        }

        let dir = find_vectors_dir();
        let target = dir.join("dice.json");
        let json = serde_json::to_string_pretty(&vectors).unwrap();
        std::fs::write(&target, json).expect("Failed to write dice.json");
    }

    #[test]
    fn test_dice_vectors() {
        let dir = find_vectors_dir();
        let file = dir.join("dice.json");
        if !file.exists() {
            return;
        }
        let data = std::fs::read_to_string(&file).unwrap();
        let vectors: Vec<VectorRecord> = serde_json::from_str(&data).unwrap();

        for (idx, vec) in vectors.iter().enumerate() {
            let mut state = [0u8; 1024];
            DiceDuel::init(&mut state, 0, 1000).unwrap();

            let mut last_outcome = Outcome::Continue;
            let mut current_player = 0u8;

            for action_hex in &vec.actions {
                let action_bytes = hex::decode(action_hex).unwrap();
                last_outcome =
                    DiceDuel::apply(&mut state, current_player, &action_bytes, 1000).unwrap();
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
