use anchor_lang::prelude::*;
use hex;
use serde::{Deserialize, Serialize};
use solduel::games::connect_four::ConnectFour;
use solduel::games::{Game, Outcome};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct TestVector {
    pub players: Vec<String>,
    pub actions: Vec<String>,
    pub expected_outcome: serde_json::Value,
    pub final_state_hex: String,
}

fn find_vectors_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("../../../tests/vectors"),
        PathBuf::from("../../tests/vectors"),
        PathBuf::from("../tests/vectors"),
        PathBuf::from("tests/vectors"),
    ];

    for candidate in &candidates {
        if candidate.exists() && candidate.is_dir() {
            return candidate.clone();
        }
    }

    panic!("Could not find tests/vectors directory in candidate paths");
}

#[test]
fn generate_connect_four_vectors() {
    let vectors_dir = find_vectors_dir();
    let file_path = vectors_dir.join("connect-four.json");

    let p0 = "11111111111111111111111111111111".to_string();
    let p1 = "22222222222222222222222222222222".to_string();

    let mut vectors = Vec::new();

    // Vector 1: Vertical Win for Player 0
    // P0: col 0, P1: col 1, P0: col 0, P1: col 1, P0: col 0, P1: col 1, P0: col 0 (4 in col 0)
    {
        let mut state = [0u8; 1024];
        ConnectFour::init(&mut state, 0, 1000).unwrap();
        let actions = vec![
            "00".to_string(),
            "01".to_string(),
            "00".to_string(),
            "01".to_string(),
            "00".to_string(),
            "01".to_string(),
            "00".to_string(),
        ];

        let mut outcome = Outcome::Continue;
        let mut current_player = 0u8;
        for action_hex in &actions {
            let data = hex::decode(action_hex).unwrap();
            outcome = ConnectFour::apply(&mut state, current_player, &data, 1000).unwrap();
            current_player = 1 - current_player;
        }

        assert_eq!(outcome, Outcome::Win(0));

        vectors.push(TestVector {
            players: vec![p0.clone(), p1.clone()],
            actions,
            expected_outcome: serde_json::json!({ "win": 0 }),
            final_state_hex: hex::encode(&state),
        });
    }

    // Vector 2: Horizontal Win for Player 1
    // P0 plays col 0, P1 plays col 1, P0 plays col 0, P1 plays col 2,
    // P0 plays col 0, P1 plays col 3, P0 plays col 6, P1 plays col 4 (P1 connects 1, 2, 3, 4)
    {
        let mut state = [0u8; 1024];
        ConnectFour::init(&mut state, 0, 1000).unwrap();
        let actions = vec![
            "00".to_string(), // P0 -> (0,0)
            "01".to_string(), // P1 -> (1,0)
            "00".to_string(), // P0 -> (0,1)
            "02".to_string(), // P1 -> (2,0)
            "00".to_string(), // P0 -> (0,2)
            "03".to_string(), // P1 -> (3,0)
            "06".to_string(), // P0 -> (6,0)
            "04".to_string(), // P1 -> (4,0) WIN!
        ];

        let mut outcome = Outcome::Continue;
        let mut current_player = 0u8;
        for action_hex in &actions {
            let data = hex::decode(action_hex).unwrap();
            outcome = ConnectFour::apply(&mut state, current_player, &data, 1000).unwrap();
            current_player = 1 - current_player;
        }

        assert_eq!(outcome, Outcome::Win(1));

        vectors.push(TestVector {
            players: vec![p0.clone(), p1.clone()],
            actions,
            expected_outcome: serde_json::json!({ "win": 1 }),
            final_state_hex: hex::encode(&state),
        });
    }

    // Vector 3: In-Progress Game (Continue)
    {
        let mut state = [0u8; 1024];
        ConnectFour::init(&mut state, 0, 1000).unwrap();
        let actions = vec![
            "03".to_string(), // P0 -> col 3
            "03".to_string(), // P1 -> col 3
            "04".to_string(), // P0 -> col 4
        ];

        let mut outcome = Outcome::Continue;
        let mut current_player = 0u8;
        for action_hex in &actions {
            let data = hex::decode(action_hex).unwrap();
            outcome = ConnectFour::apply(&mut state, current_player, &data, 1000).unwrap();
            current_player = 1 - current_player;
        }

        assert_eq!(outcome, Outcome::Continue);

        vectors.push(TestVector {
            players: vec![p0.clone(), p1.clone()],
            actions,
            expected_outcome: serde_json::json!("continue"),
            final_state_hex: hex::encode(&state),
        });
    }

    let json_str = serde_json::to_string_pretty(&vectors).unwrap();
    fs::write(&file_path, json_str).unwrap();
}

#[test]
fn test_all_vectors() {
    let vectors_dir = find_vectors_dir();
    let entries = fs::read_dir(&vectors_dir).expect("Failed to read vectors directory");

    let mut found_json = false;
    for entry in entries {
        let entry = entry.expect("Failed to read dir entry");
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            found_json = true;
            let content = fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("Failed to read file {}: {}", path.display(), e));
            let vectors: Vec<TestVector> = serde_json::from_str(&content)
                .unwrap_or_else(|e| panic!("Failed to parse JSON in {}: {}", path.display(), e));

            if vectors.is_empty() {
                continue;
            }

            let file_name = path.file_stem().unwrap().to_str().unwrap();

            for (idx, vec) in vectors.iter().enumerate() {
                assert_eq!(
                    vec.players.len(),
                    2,
                    "Vector #{} in {} must have 2 players",
                    idx,
                    path.display()
                );

                if file_name == "connect-four" {
                    let mut state = [0u8; 1024];
                    ConnectFour::init(&mut state, 0, 1000).unwrap();
                    let mut current_player = 0u8;
                    let mut last_outcome = Outcome::Continue;

                    for action_hex in &vec.actions {
                        let data = hex::decode(action_hex).unwrap();
                        last_outcome =
                            ConnectFour::apply(&mut state, current_player, &data, 1000).unwrap();
                        current_player = 1 - current_player;
                    }

                    // Verify expected outcome
                    let expected_str = vec.expected_outcome.to_string();
                    match last_outcome {
                        Outcome::Continue => assert_eq!(expected_str, "\"continue\""),
                        Outcome::Win(winner) => {
                            assert_eq!(expected_str, format!("{{\"win\":{}}}", winner));
                        }
                        Outcome::Draw => assert_eq!(expected_str, "\"draw\""),
                    }

                    // Verify final state hex
                    assert_eq!(
                        hex::encode(&state),
                        vec.final_state_hex,
                        "Final state mismatch in vector #{} of {}",
                        idx,
                        path.display()
                    );
                }
            }
        }
    }

    assert!(found_json, "Expected to find at least one .json vector file");
}
