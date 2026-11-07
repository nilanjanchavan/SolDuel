import fs from 'fs';
import path from 'path';
import { connectFourEngine } from '../src/games/connect-four';

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
        continue;
      }

      for (const [idx, vector] of vectors.entries()) {
        expect(vector).toHaveProperty('players');
        expect(vector).toHaveProperty('actions');
        expect(vector).toHaveProperty('expected_outcome');
        expect(vector).toHaveProperty('final_state_hex');
        expect(vector.players.length).toBe(2);

        if (file === 'connect-four.json') {
          let state = connectFourEngine.init(0);
          let currentPlayer: 0 | 1 = 0;
          let lastOutcome: any = 'continue';

          for (const actionHex of vector.actions) {
            const col = parseInt(actionHex, 16);
            const res = connectFourEngine.apply(state, currentPlayer, col);
            state = res.state;
            lastOutcome = res.outcome;
            currentPlayer = (1 - currentPlayer) as 0 | 1;
          }

          expect(lastOutcome).toEqual(vector.expected_outcome);

          // Decode final_state_hex using engine decodeState
          const finalStateBuf = Buffer.from(vector.final_state_hex, 'hex');
          const decoded = connectFourEngine.decodeState(new Uint8Array(finalStateBuf));

          expect(state.moves).toBe(decoded.moves);
          expect(state.turn).toBe(decoded.turn);
          expect(state.board).toEqual(decoded.board);
        }
      }
    }
  });
});
