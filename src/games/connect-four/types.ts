export interface ConnectFourState {
  turn: 0 | 1;
  moves: number;
  lastMove: { col: number; row: number } | null;
  board: (0 | 1 | null)[][]; // 7 cols x 6 rows (0 is bottom row, 5 is top row)
}

export type ConnectFourMove = number; // Column index (0..6)
