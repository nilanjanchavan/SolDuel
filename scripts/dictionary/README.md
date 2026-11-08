# SolDuel Dictionary & Merkle Tree Specification

This directory contains the dictionary builder script, reference word list, and specification for the Merkle tree used in SolDuel's **Word Chain** minigame.

---

## 1. Word List & License

- **Source**: **ENABLE1** (*Enhanced North American Benchmark Lexicon*)
- **Authors**: Alan Beale and M. Cooper
- **License**: **Public Domain**
  - No copyright restrictions, licensing fees, or attribution requirements.
- **Filtering Rules**:
  - Filter: `^[a-z]{3,}$` (lowercase letters `a-z`, minimum length 3).
  - Punctuation, uppercase characters, digits, and words shorter than 3 letters are excluded.
  - Total filtered words: **172,727** unique words, sorted lexicographically ascending.

---

## 2. Merkle Tree Construction Rules

### Leaf Hashing
- Each leaf is computed as the raw SHA-256 digest of the UTF-8/ASCII bytes of the lowercase word:
  $$\text{leaf} = \text{SHA-256}(\text{word})$$
- Output length: 32 bytes (`[u8; 32]`).
- Leaves are initially ordered corresponding to the alphabetically sorted word list.

### Ordering & Parent Node Hashing (Sorted Pairs)
- Internal node pairing uses **sorted pairs** (`sortPairs: true`, following OpenZeppelin / standard crypto conventions):
  $$\text{parent} = \text{SHA-256}(\min(\text{left}, \text{right}) \mathbin{\Vert} \max(\text{left}, \text{right}))$$
  where comparison is standard unsigned lexicographical byte comparison (`a < b`).
- **Odd Node Promotion**: When a tree layer has an odd number of nodes, the trailing odd node is promoted directly to the next layer without hashing.

### Tree Properties
- **Merkle Root**: `f487d5a4b05cdac2d44ea8b5249dc70e9001aca078040bc97d30652e2e16fe79`
- **Tree Depth**: **18**
- **Proof Length**: 18 hashes $\times$ 32 bytes = **576 bytes** per proof.

---

## 3. Rust Verifier Matching Specification

The on-chain verifier in `word_chain.rs` matches this exact hashing logic without needing direction flags:

```rust
use sha2::{Digest, Sha256};

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
```

---

## 4. 676-Bit Two-Letter Prefix Flags

In Word Chain, each word must start with the previous word's last two letters if at least 10 dictionary words start with that pair, otherwise its last letter.

- Combinations: $26 \times 26 = 676$ possible two-letter starts (`aa` to `zz`).
- Index Formula:
  $$\text{index}(c_0, c_1) = (c_0 - \text{'a'}) \times 26 + (c_1 - \text{'a'})$$
  Range: $[0..675]$.
- Representation: **85 bytes** ($85 \times 8 = 680$ bits, with 4 unused bits in the final byte).
- Bit Access:
  - Byte index: $\lfloor \text{index} / 8 \rfloor$
  - Bit index: $\text{index} \pmod 8$
  - Condition: `(flags[byte_idx] >> bit_idx) & 1 == 1`
- Summary Counts:
  - Valid prefixes ($\ge 10$ words): **257** out of 676.
  - `ng`: 3 words ($< 10$) $\rightarrow$ flag is **0** (false).
  - `st`: 2597 words ($\ge 10$) $\rightarrow$ flag is **1** (true).
- Flags Hex:
  `fffdff47264914992471e490547fffbf452449109926514410444ff82e44044110992653441044114110450441f4dfef7f649a4700001044064154d99f576490d542b82e4404411019245104004011411844040104`

---

## 5. Solana Transaction Size & Proof Depth Analysis

- **Proof Depth**: **18** levels.
- **Proof Payload**: $18 \times 32 = 576$ bytes.
- **Action Data Budget**:
  - Word length byte: 1 byte
  - Word string: $\le 25$ bytes
  - Merkle proof: 576 bytes
  - Total `data`: $\approx 602$ bytes.
- **Transaction Packet Limit**: Solana enforces the standard IPv6 MTU limit of **1232 bytes**.
- **Overhead**:
  - Signatures: 64 bytes (1 signer)
  - Account public keys & header: $\approx 160$ bytes
  - Recent blockhash: 32 bytes
  - Total instruction overhead: $\approx 256$ bytes
- **Total Transaction Size**: $\approx 602 + 256 = \mathbf{858\text{ bytes}} \le 1232\text{ bytes}$.
- **Result**: Proof plus word **comfortably fits in a single transaction**.

---

## 6. Sharded Static Files (`public/dictionary/`)

To prevent the client browser from loading the entire multi-megabyte proof set at once:
- The 257 two-letter prefixes that satisfy the Word Chain rule ($\ge 10$ words) have their own dedicated shard: `public/dictionary/shards/<prefix>.json`.
- Rare prefixes ($< 10$ words, such as `ng` with 3 words) are grouped together in `public/dictionary/shards/_rare.json`.
- This ensures 100% of dictionary words have static proofs while keeping the total shard file count at 258 files, well within static asset and repository limits.
- When a player submits a move starting with prefix `st`, only `shards/st.json` is fetched.
- `public/dictionary/root.json` holds the root metadata and prefix bitset.
- `public/dictionary/words.json` provides the complete word array for bot vocabulary.

