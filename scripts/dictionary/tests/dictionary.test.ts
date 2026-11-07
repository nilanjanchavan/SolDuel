import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function sha256(buf: Buffer): Buffer {
  return crypto.createHash('sha256').update(buf).digest();
}

function verifyProof(word: string, proof: string[], rootHex: string): boolean {
  let current = sha256(Buffer.from(word, 'utf8'));
  for (const sibHex of proof) {
    const sibling = Buffer.from(sibHex, 'hex');
    if (Buffer.compare(current, sibling) <= 0) {
      current = sha256(Buffer.concat([current, sibling]));
    } else {
      current = sha256(Buffer.concat([sibling, current]));
    }
  }
  return current.toString('hex') === rootHex;
}

describe('Dictionary and Merkle Tree Tests', () => {
  const dictionaryDir = path.join(__dirname, '../../../public/dictionary');
  const rootJsonPath = path.join(dictionaryDir, 'root.json');
  const wordsJsonPath = path.join(dictionaryDir, 'words.json');
  const shardsDir = path.join(dictionaryDir, 'shards');

  let rootMeta: {
    root: string;
    depth: number;
    wordCount: number;
    validPrefixesCount: number;
    flagsHex: string;
    proofBytes: number;
    fitsInTransaction: boolean;
  };

  beforeAll(() => {
    expect(fs.existsSync(rootJsonPath)).toBe(true);
    rootMeta = JSON.parse(fs.readFileSync(rootJsonPath, 'utf-8'));
  });

  it('has valid Merkle root metadata and proof depth', () => {
    expect(rootMeta.root).toMatch(/^[0-9a-f]{64}$/);
    expect(rootMeta.depth).toBe(18);
    expect(rootMeta.wordCount).toBe(172727);
    expect(rootMeta.proofBytes).toBe(18 * 32);
    expect(rootMeta.fitsInTransaction).toBe(true);
  });

  it('correctly sets flags for two-letter pairs like "ng" and "st"', () => {
    const flags = Buffer.from(rootMeta.flagsHex, 'hex');
    expect(flags.length).toBe(85);

    // Index calculation: (c0 - 'a') * 26 + (c1 - 'a')
    const getFlag = (pair: string): boolean => {
      const c0 = pair.charCodeAt(0) - 97;
      const c1 = pair.charCodeAt(1) - 97;
      const idx = c0 * 26 + c1;
      const byteIdx = Math.floor(idx / 8);
      const bitIdx = idx % 8;
      return ((flags[byteIdx] >> bitIdx) & 1) === 1;
    };

    // "ng": starts with "ng" has < 10 words (only 3 words in enable1)
    expect(getFlag('ng')).toBe(false);

    // "st": starts with "st" has >= 10 words (2597 words in enable1)
    expect(getFlag('st')).toBe(true);

    // Other sanity checks
    expect(getFlag('th')).toBe(true);
    expect(getFlag('zq')).toBe(false);
  });

  it('verifies valid sample words against Merkle root', () => {
    const sampleWords = ['apple', 'chain', 'duel', 'start', 'sword'];

    for (const word of sampleWords) {
      const prefix = word.slice(0, 2);
      const shardPath = path.join(shardsDir, `${prefix}.json`);
      expect(fs.existsSync(shardPath)).toBe(true);

      const shard = JSON.parse(fs.readFileSync(shardPath, 'utf-8'));
      expect(shard).toHaveProperty(word);

      const proof: string[] = shard[word];
      expect(proof.length).toBeLessThanOrEqual(rootMeta.depth);
      expect(proof.length).toBeGreaterThanOrEqual(rootMeta.depth - 1);

      const isValid = verifyProof(word, proof, rootMeta.root);
      expect(isValid).toBe(true);
    }
  });

  it('rejects tampered or invalid words', () => {
    const shardAp = JSON.parse(fs.readFileSync(path.join(shardsDir, 'ap.json'), 'utf-8'));
    const appleProof: string[] = shardAp['apple'];

    // Tampered word with apple's proof
    expect(verifyProof('orange', appleProof, rootMeta.root)).toBe(false);

    // Tampered proof
    const tamperedProof = [...appleProof];
    tamperedProof[0] = '00'.repeat(32);
    expect(verifyProof('apple', tamperedProof, rootMeta.root)).toBe(false);
  });

  it('provides complete word list for bot vocabulary', () => {
    expect(fs.existsSync(wordsJsonPath)).toBe(true);
    const words: string[] = JSON.parse(fs.readFileSync(wordsJsonPath, 'utf-8'));
    expect(words.length).toBe(rootMeta.wordCount);
    expect(words).toContain('apple');
    expect(words).toContain('chain');
    expect(words).toContain('duel');
  });
});
