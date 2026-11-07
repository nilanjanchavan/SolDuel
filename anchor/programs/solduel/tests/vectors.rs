use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
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
                // Empty vector list passes
                continue;
            }

            for (idx, vec) in vectors.iter().enumerate() {
                assert_eq!(
                    vec.players.len(),
                    2,
                    "Vector #{} in {} must have 2 players",
                    idx,
                    path.display()
                );
            }
        }
    }

    assert!(found_json, "Expected to find at least one .json vector file");
}

