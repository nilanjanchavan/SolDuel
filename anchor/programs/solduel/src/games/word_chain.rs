use super::{Game, Outcome};
use crate::constants::WORD_CHAIN_TIMEOUT_SECS;
use crate::errors::SolduelError;
use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

/// Root hash of the ENABLE1 dictionary Merkle tree (172,727 words, depth 18)
pub const DICTIONARY_MERKLE_ROOT: [u8; 32] = [
    0xf4, 0x87, 0xd5, 0xa4, 0xb0, 0x5c, 0xda, 0xc2, 0xd4, 0x4e, 0xa8, 0xb5, 0x24, 0x9d, 0xc7, 0x0e,
    0x90, 0x01, 0xac, 0xa0, 0x78, 0x04, 0x0b, 0xc9, 0x7d, 0x30, 0x65, 0x2e, 0x2e, 0x16, 0xfe, 0x79,
];

/// 676-bit bitset (85 bytes) indicating two-letter start pairs with at least 10 words.
/// Index: (c0 - 'a') * 26 + (c1 - 'a'). Total valid prefixes: 257.
pub const PREFIX_FLAGS: [u8; 85] = [
    0xff, 0xfd, 0xff, 0x47, 0x26, 0x49, 0x14, 0x99, 0x24, 0x71, 0xe4, 0x90, 0x54, 0x7f, 0xff, 0xbf,
    0x45, 0x24, 0x49, 0x10, 0x99, 0x26, 0x51, 0x44, 0x10, 0x44, 0x4f, 0xf8, 0x2e, 0x44, 0x04, 0x41,
    0x10, 0x99, 0x26, 0x53, 0x44, 0x10, 0x44, 0x11, 0x41, 0x10, 0x45, 0x04, 0x41, 0xf4, 0xdf, 0xef,
    0x7f, 0x64, 0x9a, 0x47, 0x00, 0x00, 0x10, 0x44, 0x06, 0x41, 0x54, 0xd9, 0x9f, 0x57, 0x64, 0x90,
    0xd5, 0x42, 0xb8, 0x2e, 0x44, 0x04, 0x41, 0x10, 0x19, 0x24, 0x51, 0x04, 0x00, 0x40, 0x11, 0x41,
    0x18, 0x44, 0x04, 0x01, 0x04,
];

pub const OFFSET_TURN: usize = 0; // 1 byte: 0 or 1
pub const OFFSET_STRIKES_0: usize = 1; // 1 byte: 0..=4
pub const OFFSET_STRIKES_1: usize = 2; // 1 byte: 0..=4
pub const OFFSET_TURN_START_TS: usize = 3; // 8 bytes: i64 little-endian
pub const OFFSET_LAST_WORD_LEN: usize = 11; // 1 byte
pub const OFFSET_LAST_WORD: usize = 12; // 32 bytes: ASCII bytes
pub const OFFSET_WORDS_COUNT: usize = 44; // 2 bytes: u16 little-endian
pub const OFFSET_HASHES: usize = 46; // Truncated 4-byte hashes of played words
pub const WORD_CHAIN_STATE_MIN_LEN: usize = 46;

/// Match-length cap: 100 words (400 bytes for hashes, well within the 1024-byte state buffer).
pub const MAX_WORDS: usize = 100;

/// Four strikes lose the match
pub const MAX_STRIKES: u8 = 4;

pub struct WordChain;

impl WordChain {
    /// Returns true if at least 10 words in the dictionary start with the two-letter pair `(c0, c1)`.
    #[inline]
    pub fn has_two_letter_prefix(c0: u8, c1: u8) -> bool {
        if c0 < b'a' || c0 > b'z' || c1 < b'a' || c1 > b'z' {
            return false;
        }
        let idx = ((c0 - b'a') as usize) * 26 + ((c1 - b'a') as usize);
        let byte_idx = idx / 8;
        let bit_idx = idx % 8;
        if byte_idx >= PREFIX_FLAGS.len() {
            return false;
        }
        (PREFIX_FLAGS[byte_idx] >> bit_idx) & 1 == 1
    }

    /// Verifies a word against the dictionary Merkle root using sorted pairs.
    pub fn verify_word_proof(root: &[u8; 32], word: &str, proof: &[[u8; 32]]) -> bool {
        let mut current: [u8; 32] = Sha256::digest(word.as_bytes()).into();

        for sibling in proof {
            let mut hasher = Sha256::new();
            if current <= *sibling {
                hasher.update(&current);
                hasher.update(sibling);
            } else {
                hasher.update(sibling);
                hasher.update(&current);
            }
            current = hasher.finalize().into();
        }

        &current == root
    }

    /// Awards a strike to the active player. If strikes reach 4, opponent wins immediately.
    /// Otherwise, the turn remains with the player and the timer keeps running.
    fn award_strike(state: &mut [u8], player: u8) -> Result<Outcome> {
        let strike_offset = if player == 0 {
            OFFSET_STRIKES_0
        } else {
            OFFSET_STRIKES_1
        };
        let strikes = state[strike_offset].saturating_add(1);
        state[strike_offset] = strikes;

        if strikes >= MAX_STRIKES {
            return Ok(Outcome::Win(1 - player));
        }

        Ok(Outcome::Continue)
    }
}

impl Game for WordChain {
    fn is_skill() -> bool {
        true
    }

    fn init(state: &mut [u8], first_player: u8, now: i64) -> Result<()> {
        if state.len() < 1024 {
            return err!(SolduelError::MathOverflow);
        }
        state.fill(0);
        state[OFFSET_TURN] = first_player;
        state[OFFSET_TURN_START_TS..OFFSET_TURN_START_TS + 8].copy_from_slice(&now.to_le_bytes());
        Ok(())
    }

    fn apply(state: &mut [u8], player: u8, data: &[u8], now: i64) -> Result<Outcome> {
        if state.len() < 1024 {
            return err!(SolduelError::MathOverflow);
        }
        if player > 1 {
            return err!(SolduelError::NotAPlayer);
        }
        if player != state[OFFSET_TURN] {
            return err!(SolduelError::NotYourTurn);
        }

        // Verify turn deadline has not elapsed
        let turn_start_ts = i64::from_le_bytes(
            state[OFFSET_TURN_START_TS..OFFSET_TURN_START_TS + 8]
                .try_into()
                .unwrap(),
        );
        if turn_start_ts > 0 && now > turn_start_ts + WORD_CHAIN_TIMEOUT_SECS {
            return err!(SolduelError::ActionTimedOut);
        }

        // Action payload format:
        // [0]: word_len (u8)
        // [1 .. 1 + word_len]: word (lowercase ASCII)
        // [1 + word_len]: proof_len (u8)
        // [1 + word_len + 1 .. 1 + word_len + 1 + proof_len * 32]: Merkle proof hashes
        if data.is_empty() {
            return Self::award_strike(state, player);
        }

        let word_len = data[0] as usize;
        if word_len < 3 || word_len > 32 || data.len() < 1 + word_len + 1 {
            return Self::award_strike(state, player);
        }

        let word_bytes = &data[1..1 + word_len];
        if !word_bytes.iter().all(|&b| b >= b'a' && b <= b'z') {
            return Self::award_strike(state, player);
        }

        let word = match std::str::from_utf8(word_bytes) {
            Ok(s) => s,
            Err(_) => return Self::award_strike(state, player),
        };

        let proof_len = data[1 + word_len] as usize;
        let expected_len = 1 + word_len + 1 + proof_len * 32;
        if data.len() < expected_len {
            return Self::award_strike(state, player);
        }

        // Parse Merkle proof siblings
        let mut proof = Vec::with_capacity(proof_len);
        let mut offset = 1 + word_len + 1;
        for _ in 0..proof_len {
            let mut sib = [0u8; 32];
            sib.copy_from_slice(&data[offset..offset + 32]);
            proof.push(sib);
            offset += 32;
        }

        // Enforce prefix rules
        let last_word_len = state[OFFSET_LAST_WORD_LEN] as usize;
        if last_word_len > 0 {
            let prev_word = &state[OFFSET_LAST_WORD..OFFSET_LAST_WORD + last_word_len];
            let c0 = prev_word[last_word_len - 2];
            let c1 = prev_word[last_word_len - 1];

            if Self::has_two_letter_prefix(c0, c1) {
                // Must start with the last two letters
                if word_len < 2 || word_bytes[0] != c0 || word_bytes[1] != c1 {
                    return Self::award_strike(state, player);
                }
            } else {
                // Must start with the last letter
                if word_bytes[0] != c1 {
                    return Self::award_strike(state, player);
                }
            }
        }

        // Enforce no-repeat rule using truncated 4-byte SHA-256 hash
        let full_hash = Sha256::digest(word_bytes);
        let hash4: [u8; 4] = full_hash[0..4].try_into().unwrap();

        let words_count = u16::from_le_bytes(
            state[OFFSET_WORDS_COUNT..OFFSET_WORDS_COUNT + 2]
                .try_into()
                .unwrap(),
        ) as usize;

        for i in 0..words_count {
            let h_start = OFFSET_HASHES + i * 4;
            if &state[h_start..h_start + 4] == hash4 {
                // Repeated word -> strike
                return Self::award_strike(state, player);
            }
        }

        // Verify Merkle proof against dictionary root
        if !Self::verify_word_proof(&DICTIONARY_MERKLE_ROOT, word, &proof) {
            return Self::award_strike(state, player);
        }

        // Valid word accepted! Record truncated hash
        if words_count < MAX_WORDS {
            let h_start = OFFSET_HASHES + words_count * 4;
            state[h_start..h_start + 4].copy_from_slice(&hash4);
            state[OFFSET_WORDS_COUNT..OFFSET_WORDS_COUNT + 2]
                .copy_from_slice(&(words_count as u16 + 1).to_le_bytes());
        }

        // Update last word
        state[OFFSET_LAST_WORD_LEN] = word_len as u8;
        state[OFFSET_LAST_WORD..OFFSET_LAST_WORD + 32].fill(0);
        state[OFFSET_LAST_WORD..OFFSET_LAST_WORD + word_len].copy_from_slice(word_bytes);

        // Switch turn and update turn timestamp
        state[OFFSET_TURN] = 1 - player;
        state[OFFSET_TURN_START_TS..OFFSET_TURN_START_TS + 8].copy_from_slice(&now.to_le_bytes());

        // If match reached max length, decide winner by fewest strikes
        if words_count + 1 >= MAX_WORDS {
            let s0 = state[OFFSET_STRIKES_0];
            let s1 = state[OFFSET_STRIKES_1];
            if s0 < s1 {
                return Ok(Outcome::Win(0));
            } else if s1 < s0 {
                return Ok(Outcome::Win(1));
            } else {
                return Ok(Outcome::Draw);
            }
        }

        Ok(Outcome::Continue)
    }

    fn deadline_secs(_state: &[u8]) -> i64 {
        WORD_CHAIN_TIMEOUT_SECS
    }

    fn laggard(state: &[u8]) -> Option<u8> {
        if state.is_empty() {
            return None;
        }
        Some(state[OFFSET_TURN])
    }

    fn flawless_win(state: &[u8], winner: u8) -> bool {
        if state.len() < WORD_CHAIN_STATE_MIN_LEN {
            return false;
        }
        if winner == 0 {
            state[OFFSET_STRIKES_0] == 0
        } else if winner == 1 {
            state[OFFSET_STRIKES_1] == 0
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn encode_word_action(word: &str, proof: &[[u8; 32]]) -> Vec<u8> {
        let mut d = Vec::with_capacity(1 + word.len() + 1 + proof.len() * 32);
        d.push(word.len() as u8);
        d.extend_from_slice(word.as_bytes());
        d.push(proof.len() as u8);
        for p in proof {
            d.extend_from_slice(p);
        }
        d
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
    fn test_word_chain_prefix_flags() {
        // "ng": starts with "ng" has < 10 words -> false
        assert_eq!(WordChain::has_two_letter_prefix(b'n', b'g'), false);

        // "st": starts with "st" has 2597 words -> true
        assert_eq!(WordChain::has_two_letter_prefix(b's', b't'), true);

        // "in": >= 10 words -> true
        assert_eq!(WordChain::has_two_letter_prefix(b'i', b'n'), true);

        // "rt": < 10 words -> false
        assert_eq!(WordChain::has_two_letter_prefix(b'r', b't'), false);
    }

    #[test]
    fn test_strikes_and_loss() {
        let mut state = [0u8; 1024];
        WordChain::init(&mut state, 0, 1000).unwrap();

        // 1st strike on invalid empty action
        let out1 = WordChain::apply(&mut state, 0, &[], 1005).unwrap();
        assert_eq!(out1, Outcome::Continue);
        assert_eq!(state[OFFSET_STRIKES_0], 1);
        assert_eq!(state[OFFSET_TURN], 0); // Turn remains with P0

        // 2nd strike on invalid length < 3
        let out2 = WordChain::apply(&mut state, 0, &[2, b'h', b'i', 0], 1010).unwrap();
        assert_eq!(out2, Outcome::Continue);
        assert_eq!(state[OFFSET_STRIKES_0], 2);

        // 3rd strike on fake proof
        let out3 =
            WordChain::apply(&mut state, 0, &[5, b'h', b'e', b'l', b'l', b'o', 0], 1015).unwrap();
        assert_eq!(out3, Outcome::Continue);
        assert_eq!(state[OFFSET_STRIKES_0], 3);

        // 4th strike loses match for P0 -> Win(1)
        let out4 = WordChain::apply(&mut state, 0, &[], 1020).unwrap();
        assert_eq!(out4, Outcome::Win(1));
        assert_eq!(state[OFFSET_STRIKES_0], 4);

        // P1 won with 0 strikes -> flawless win!
        assert!(WordChain::flawless_win(&state, 1));
        assert!(!WordChain::flawless_win(&state, 0));
    }

    #[test]
    fn test_word_chain_negative_paths() {
        let mut state = [0u8; 1024];
        WordChain::init(&mut state, 0, 1000).unwrap();

        // 1. Out of turn caller
        let err_turn = WordChain::apply(&mut state, 1, &[], 1005).unwrap_err();
        assert_eq!(err_turn, SolduelError::NotYourTurn.into());

        // 2. Invalid player (> 1)
        let err_player = WordChain::apply(&mut state, 2, &[], 1005).unwrap_err();
        assert_eq!(err_player, SolduelError::NotAPlayer.into());

        // 3. Truncated proof payload (claims 1 proof hash = 32 bytes, but only 10 bytes provided)
        let mut truncated = vec![5, b's', b't', b'a', b'r', b't', 1];
        truncated.extend_from_slice(&[0u8; 10]);
        let out_trunc = WordChain::apply(&mut state, 0, &truncated, 1005).unwrap();
        assert_eq!(out_trunc, Outcome::Continue);
        assert_eq!(state[OFFSET_STRIKES_0], 1);

        // 4. Non-lowercase ASCII characters
        let uppercase = vec![5, b'S', b'T', b'A', b'R', b'T', 0];
        let out_upper = WordChain::apply(&mut state, 0, &uppercase, 1005).unwrap();
        assert_eq!(out_upper, Outcome::Continue);
        assert_eq!(state[OFFSET_STRIKES_0], 2);

        // Reset state for prefix violation testing
        WordChain::init(&mut state, 0, 1000).unwrap();

        // P0 plays valid "start" (ends with "rt" -> flag is 0 -> requires 1-letter start 't')
        let p_start = load_proof_helper("start");
        let a_start = encode_word_action("start", &p_start);
        assert_eq!(
            WordChain::apply(&mut state, 0, &a_start, 1000).unwrap(),
            Outcome::Continue
        );
        assert_eq!(state[OFFSET_TURN], 1);

        // 5. 1-letter prefix violation: P1 plays "water" (starts with 'w' instead of 't')
        let p_water = load_proof_helper("water");
        let a_water = encode_word_action("water", &p_water);
        let out_pref1 = WordChain::apply(&mut state, 1, &a_water, 1000).unwrap();
        assert_eq!(out_pref1, Outcome::Continue);
        assert_eq!(state[OFFSET_STRIKES_1], 1);
        assert_eq!(state[OFFSET_TURN], 1); // P1 retains turn

        // P1 plays valid "train" (starts with 't', ends with "in" -> requires 2-letter start "in")
        let p_train = load_proof_helper("train");
        let a_train = encode_word_action("train", &p_train);
        assert_eq!(
            WordChain::apply(&mut state, 1, &a_train, 1000).unwrap(),
            Outcome::Continue
        );
        assert_eq!(state[OFFSET_TURN], 0);

        // 6. 2-letter prefix violation: P0 plays "toast" (starts with "to" instead of "in")
        let p_toast = load_proof_helper("toast");
        let a_toast = encode_word_action("toast", &p_toast);
        let out_pref2 = WordChain::apply(&mut state, 0, &a_toast, 1000).unwrap();
        assert_eq!(out_pref2, Outcome::Continue);
        assert_eq!(state[OFFSET_STRIKES_0], 1);
        assert_eq!(state[OFFSET_TURN], 0);

        // 7. 100-word cap: Playing the 100th valid word ends the match
        state[OFFSET_WORDS_COUNT..OFFSET_WORDS_COUNT + 2]
            .copy_from_slice(&((MAX_WORDS - 1) as u16).to_le_bytes());
        let p_into = load_proof_helper("into");
        let a_into = encode_word_action("into", &p_into);
        let out_cap = WordChain::apply(&mut state, 0, &a_into, 1000).unwrap();
        assert_eq!(out_cap, Outcome::Draw);
    }

    fn load_proof_helper(word: &str) -> Vec<[u8; 32]> {
        let dir = find_vectors_dir();
        let pub_shards = dir.join("../../public/dictionary/shards");
        let prefix = &word[0..2];
        let shard_file = pub_shards.join(format!("{}.json", prefix));
        let data = std::fs::read_to_string(&shard_file)
            .unwrap_or_else(|_| panic!("Failed to read shard {}", shard_file.display()));
        let json: serde_json::Value = serde_json::from_str(&data).unwrap();
        let arr = json
            .get(word)
            .expect("Word not in shard")
            .as_array()
            .unwrap();
        arr.iter()
            .map(|v| {
                let hex_str = v.as_str().unwrap();
                let bytes = hex::decode(hex_str).unwrap();
                let mut b = [0u8; 32];
                b.copy_from_slice(&bytes);
                b
            })
            .collect()
    }

    #[test]
    #[ignore]
    fn generate_word_chain_vectors() {
        let p0 = "11111111111111111111111111111111".to_string();
        let p1 = "22222222222222222222222222222222".to_string();
        let dir = find_vectors_dir();

        let load_proof = |word: &str| -> Vec<[u8; 32]> { load_proof_helper(word) };

        let mut vectors = Vec::new();

        // Vector 1: Flawless Win for Player 0 (P1 commits 4 strikes)
        // P0 plays "start" (valid word, depth 17)
        // P1 plays 4 invalid words -> P0 wins with 0 strikes!
        {
            let mut state = [0u8; 1024];
            WordChain::init(&mut state, 0, 1000).unwrap();

            let proof_start = load_proof("start");
            let a0 = encode_word_action("start", &proof_start);

            let mut actions = Vec::new();
            actions.push(hex::encode(&a0));
            let out0 = WordChain::apply(&mut state, 0, &a0, 1000).unwrap();
            assert_eq!(out0, Outcome::Continue);
            assert_eq!(state[OFFSET_TURN], 1);

            // P1 makes 4 strikes with empty data
            let strike_action = hex::encode(&[]);
            for _ in 0..4 {
                actions.push(strike_action.clone());
            }

            WordChain::apply(&mut state, 1, &[], 1005).unwrap();
            WordChain::apply(&mut state, 1, &[], 1010).unwrap();
            WordChain::apply(&mut state, 1, &[], 1015).unwrap();
            let out_final = WordChain::apply(&mut state, 1, &[], 1020).unwrap();
            assert_eq!(out_final, Outcome::Win(0));
            assert!(WordChain::flawless_win(&state, 0));

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!({ "win": 0 }),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 2: Valid Multi-Turn Word Chain (start -> train -> into -> toast)
        {
            let mut state = [0u8; 1024];
            WordChain::init(&mut state, 0, 1000).unwrap();

            let mut actions = Vec::new();

            // P0: "start" (ends with "rt", flag is 0 -> next starts with "t")
            let p_start = load_proof("start");
            let a0 = encode_word_action("start", &p_start);
            actions.push(hex::encode(&a0));
            assert_eq!(
                WordChain::apply(&mut state, 0, &a0, 1000).unwrap(),
                Outcome::Continue
            );

            // P1: "train" (starts with "t", ends with "in", flag is 1 -> next starts with "in")
            let p_train = load_proof("train");
            let a1 = encode_word_action("train", &p_train);
            actions.push(hex::encode(&a1));
            assert_eq!(
                WordChain::apply(&mut state, 1, &a1, 1000).unwrap(),
                Outcome::Continue
            );

            // P0: "into" (starts with "in", ends with "to", flag is 1 -> next starts with "to")
            let p_into = load_proof("into");
            let a2 = encode_word_action("into", &p_into);
            actions.push(hex::encode(&a2));
            assert_eq!(
                WordChain::apply(&mut state, 0, &a2, 1000).unwrap(),
                Outcome::Continue
            );

            // P1: "toast" (starts with "to")
            let p_toast = load_proof("toast");
            let a3 = encode_word_action("toast", &p_toast);
            actions.push(hex::encode(&a3));
            let out = WordChain::apply(&mut state, 1, &a3, 1000).unwrap();
            assert_eq!(out, Outcome::Continue);

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!("continue"),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 3: Repeated word strike and recovery
        {
            let mut state = [0u8; 1024];
            WordChain::init(&mut state, 0, 1000).unwrap();

            let mut actions = Vec::new();

            // P0: "start"
            let p_start = load_proof("start");
            let a0 = encode_word_action("start", &p_start);
            actions.push(hex::encode(&a0));
            WordChain::apply(&mut state, 0, &a0, 1000).unwrap();

            // P1: attempts "start" again -> Repeat strike!
            actions.push(hex::encode(&a0));
            let out_strike = WordChain::apply(&mut state, 1, &a0, 1000).unwrap();
            assert_eq!(out_strike, Outcome::Continue);
            assert_eq!(state[OFFSET_STRIKES_1], 1);
            assert_eq!(state[OFFSET_TURN], 1); // Still P1 turn

            // P1 recovers with valid "train"
            let p_train = load_proof("train");
            let a1 = encode_word_action("train", &p_train);
            actions.push(hex::encode(&a1));
            let out_rec = WordChain::apply(&mut state, 1, &a1, 1000).unwrap();
            assert_eq!(out_rec, Outcome::Continue);
            assert_eq!(state[OFFSET_TURN], 0);

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!("continue"),
                final_state_hex: hex::encode(&state),
            });
        }

        // Vector 4: Negative case - Prefix violation strike and recovery
        {
            let mut state = [0u8; 1024];
            WordChain::init(&mut state, 0, 1000).unwrap();

            let mut actions = Vec::new();

            // P0: "start" (ends with "rt" -> flag is 0 -> requires 1-letter start 't')
            let p_start = load_proof("start");
            let a0 = encode_word_action("start", &p_start);
            actions.push(hex::encode(&a0));
            assert_eq!(
                WordChain::apply(&mut state, 0, &a0, 1000).unwrap(),
                Outcome::Continue
            );

            // P1: prefix violation: plays "water" (starts with 'w' instead of 't') -> Strike!
            let p_water = load_proof("water");
            let a_water = encode_word_action("water", &p_water);
            actions.push(hex::encode(&a_water));
            let out_strike = WordChain::apply(&mut state, 1, &a_water, 1000).unwrap();
            assert_eq!(out_strike, Outcome::Continue);
            assert_eq!(state[OFFSET_STRIKES_1], 1);
            assert_eq!(state[OFFSET_TURN], 1); // P1 retains turn

            // P1 recovers with valid "train" (starts with 't', ends with "in" -> requires "in")
            let p_train = load_proof("train");
            let a1 = encode_word_action("train", &p_train);
            actions.push(hex::encode(&a1));
            assert_eq!(
                WordChain::apply(&mut state, 1, &a1, 1000).unwrap(),
                Outcome::Continue
            );
            assert_eq!(state[OFFSET_TURN], 0);

            // P0 plays valid "into" (starts with "in")
            let p_into = load_proof("into");
            let a2 = encode_word_action("into", &p_into);
            actions.push(hex::encode(&a2));
            assert_eq!(
                WordChain::apply(&mut state, 0, &a2, 1000).unwrap(),
                Outcome::Continue
            );

            vectors.push(VectorRecord {
                players: vec![p0.clone(), p1.clone()],
                actions,
                expected_outcome: serde_json::json!("continue"),
                final_state_hex: hex::encode(&state),
            });
        }

        let target = dir.join("word_chain.json");
        let json = serde_json::to_string_pretty(&vectors).unwrap();
        std::fs::write(&target, json).expect("Failed to write word_chain.json");
    }

    #[test]
    fn test_word_chain_vectors() {
        let dir = find_vectors_dir();
        let file = dir.join("word_chain.json");
        assert!(file.exists(), "Vector file {} must exist", file.display());
        let data = std::fs::read_to_string(&file).unwrap();
        let vectors: Vec<VectorRecord> = serde_json::from_str(&data).unwrap();

        for (idx, vec) in vectors.iter().enumerate() {
            let mut state = [0u8; 1024];
            WordChain::init(&mut state, 0, 1000).unwrap();

            let mut last_outcome = Outcome::Continue;

            for action_hex in &vec.actions {
                let current_turn = state[OFFSET_TURN];
                let action_bytes = hex::decode(action_hex).unwrap();
                last_outcome =
                    WordChain::apply(&mut state, current_turn, &action_bytes, 1000).unwrap();
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
