import { ConnectFourState } from './types';

export const COLS = 7;
export const ROWS = 6;

/**
 * Returns all column indices that are not yet full.
 */
export function getValidMoves(board: (0 | 1 | null)[][]): number[] {
  const moves: number[] = [];
  // Center-out column ordering for alpha-beta pruning efficiency
  const colOrder = [3, 2, 4, 1, 5, 0, 6];
  for (const c of colOrder) {
    if (board[c][ROWS - 1] === null) {
      moves.push(c);
    }
  }
  return moves;
}

/**
 * Returns lowest empty row in column, or -1 if full.
 */
export function getLowestEmptyRow(board: (0 | 1 | null)[][], col: number): number {
  for (let r = 0; r < ROWS; r++) {
    if (board[col][r] === null) return r;
  }
  return -1;
}

/**
 * Checks if the last move at (col, row) formed 4 in a row for piece.
 */
export function checkWin(
  board: (0 | 1 | null)[][],
  col: number,
  row: number,
  piece: 0 | 1
): boolean {
  const dirs = [
    [1, 0], // horizontal
    [0, 1], // vertical
    [1, 1], // diag up-right
    [1, -1], // diag down-right
  ];

  for (const [dc, dr] of dirs) {
    let count = 1;

    // Forward
    let c = col + dc;
    let r = row + dr;
    while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[c][r] === piece) {
      count++;
      c += dc;
      r += dr;
    }

    // Backward
    c = col - dc;
    r = row - dr;
    while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[c][r] === piece) {
      count++;
      c -= dc;
      r -= dr;
    }

    if (count >= 4) return true;
  }

  return false;
}

/**
 * Evaluates a line of 4 cells for scoring.
 */
function evaluateLine(line: (0 | 1 | null)[], me: 0 | 1): number {
  const opp = (1 - me) as 0 | 1;
  let meCount = 0;
  let oppCount = 0;

  for (const cell of line) {
    if (cell === me) meCount++;
    else if (cell === opp) oppCount++;
  }

  if (meCount > 0 && oppCount > 0) return 0;
  if (meCount === 4) return 100000;
  if (oppCount === 4) return -100000;
  if (meCount === 3) return 100;
  if (meCount === 2) return 10;
  if (oppCount === 3) return -120;
  if (oppCount === 2) return -12;
  return 0;
}

/**
 * Heuristic board evaluation for minimax.
 */
export function evaluateBoard(board: (0 | 1 | null)[][], me: 0 | 1): number {
  let score = 0;

  // Center column preference
  const centerCol = 3;
  for (let r = 0; r < ROWS; r++) {
    if (board[centerCol][r] === me) score += 6;
    else if (board[centerCol][r] === (1 - me)) score -= 6;
  }

  // Horizontals
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += evaluateLine(
        [board[c][r], board[c + 1][r], board[c + 2][r], board[c + 3][r]],
        me
      );
    }
  }

  // Verticals
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      score += evaluateLine(
        [board[c][r], board[c][r + 1], board[c][r + 2], board[c][r + 3]],
        me
      );
    }
  }

  // Diagonals up-right
  for (let c = 0; c <= COLS - 4; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      score += evaluateLine(
        [board[c][r], board[c + 1][r + 1], board[c + 2][r + 2], board[c + 3][r + 3]],
        me
      );
    }
  }

  // Diagonals down-right
  for (let c = 0; c <= COLS - 4; c++) {
    for (let r = 3; r < ROWS; r++) {
      score += evaluateLine(
        [board[c][r], board[c + 1][r - 1], board[c + 2][r - 2], board[c + 3][r - 3]],
        me
      );
    }
  }

  return score;
}

/**
 * Minimax with Alpha-Beta Pruning.
 */
function minimax(
  board: (0 | 1 | null)[][],
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  me: 0 | 1,
  lastCol?: number,
  lastRow?: number
): { score: number; bestCol: number } {
  const opp = (1 - me) as 0 | 1;

  if (lastCol !== undefined && lastRow !== undefined) {
    const prevPlayer = isMaximizing ? opp : me;
    if (checkWin(board, lastCol, lastRow, prevPlayer)) {
      return {
        score: prevPlayer === me ? 100000 + depth : -100000 - depth,
        bestCol: lastCol,
      };
    }
  }

  const validMoves = getValidMoves(board);
  if (depth === 0 || validMoves.length === 0) {
    return { score: evaluateBoard(board, me), bestCol: validMoves[0] ?? 3 };
  }

  let bestCol = validMoves[0];

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const col of validMoves) {
      const row = getLowestEmptyRow(board, col);
      board[col][row] = me;
      const evaluation = minimax(board, depth - 1, alpha, beta, false, me, col, row).score;
      board[col][row] = null;

      if (evaluation > maxEval) {
        maxEval = evaluation;
        bestCol = col;
      }
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return { score: maxEval, bestCol };
  } else {
    let minEval = Infinity;
    for (const col of validMoves) {
      const row = getLowestEmptyRow(board, col);
      board[col][row] = opp;
      const evaluation = minimax(board, depth - 1, alpha, beta, true, me, col, row).score;
      board[col][row] = null;

      if (evaluation < minEval) {
        minEval = evaluation;
        bestCol = col;
      }
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return { score: minEval, bestCol };
  }
}

/**
 * Creates bot move generator for easy, medium, and hard levels.
 */
export function getBotMove(level: 'easy' | 'medium' | 'hard', state: ConnectFourState, p: 0 | 1): number {
  const validMoves = getValidMoves(state.board);
  if (validMoves.length === 0) return 3;

  if (level === 'easy') {
    // 70% random, 30% check immediate win/block
    if (Math.random() < 0.3) {
      // First scan for immediate winning move
      for (const col of validMoves) {
        const row = getLowestEmptyRow(state.board, col);
        if (checkWin(state.board, col, row, p)) return col;
      }
      // Next scan for immediate blocking move
      const opp = (1 - p) as 0 | 1;
      for (const col of validMoves) {
        const row = getLowestEmptyRow(state.board, col);
        if (checkWin(state.board, col, row, opp)) return col;
      }
    }
    const idx = Math.floor(Math.random() * validMoves.length);
    return validMoves[idx];
  }

  if (level === 'medium') {
    // Depth 2 search: checks immediate win and block
    const clone = state.board.map((c) => [...c]);
    return minimax(clone, 2, -Infinity, Infinity, true, p).bestCol;
  }

  // Hard level: Depth 5 search with alpha-beta pruning
  const clone = state.board.map((c) => [...c]);
  return minimax(clone, 5, -Infinity, Infinity, true, p).bestCol;
}
