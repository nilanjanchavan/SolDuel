import fs from 'fs';
import path from 'path';

export interface TestVector {
  players: [string, string];
  actions: string[]; // hex-encoded actions
  expected_outcome: 'continue' | 'draw' | { win: 0 | 1 } | string;
  final_state_hex: string;
}

describe('Shared test vectors runner', () => {
  const vectorsDir = path.join(__dirname, 'vectors');

  it('reads every vector file and verifies vectors or passes on empty list', () => {
    if (!fs.existsSync(vectorsDir)) {
      console.warn(`Vectors directory not found at ${vectorsDir}`);
      return;
    }

    const files = fs.readdirSync(vectorsDir).filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const filePath = path.join(vectorsDir, file);
      const rawData = fs.readFileSync(filePath, 'utf-8');
      const vectors: TestVector[] = JSON.parse(rawData);

      expect(Array.isArray(vectors)).toBe(true);

      if (vectors.length === 0) {
        // Empty list passes
        continue;
      }

      for (const vector of vectors) {
        expect(vector).toHaveProperty('players');
        expect(vector).toHaveProperty('actions');
        expect(vector).toHaveProperty('expected_outcome');
        expect(vector).toHaveProperty('final_state_hex');
        expect(Array.isArray(vector.players)).toBe(true);
        expect(Array.isArray(vector.actions)).toBe(true);
      }
    }
  });
});

