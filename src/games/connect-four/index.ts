import React from 'react';
import { GameEngine, GameKind, GameUI, Outcome } from '../types';
import { ConnectFourState, ConnectFourMove } from './types';
import { COLS, ROWS, checkWin, getLowestEmptyRow, getBotMove } from './bot';
import { ConnectFourBoard } from './ui';

export * from './types';
export * from './bot';
export * from './ui';

export const connectFourEngine: GameEngine<ConnectFourState, ConnectFourMove> = {
  kind: GameKind.ConnectFour,
  isSkill: true,

  init(firstPlayer: 0 | 1): ConnectFourState {
    return {
      turn: firstPlayer,
      moves: 0,
      lastMove: null,
      board: Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => null)),
    };
  },

  apply(
    s: ConnectFourState,
    p: 0 | 1,
    m: ConnectFourMove
  ): { state: ConnectFourState; outcome: Outcome } {
    if (s.turn !== p) {
      throw new Error('Not your turn');
    }
    if (m < 0 || m >= COLS) {
      throw new Error(`Invalid column: ${m}`);
    }

    const row = getLowestEmptyRow(s.board, m);
    if (row === -1) {
      throw new Error(`Column ${m} is already full`);
    }

    // Clone board
    const newBoard = s.board.map((col) => [...col]);
    newBoard[m][row] = p;
    const moves = s.moves + 1;
    const lastMove = { col: m, row };

    // Check win
    if (checkWin(newBoard, m, row, p)) {
      return {
        state: {
          turn: p,
          moves,
          lastMove,
          board: newBoard,
        },
        outcome: { win: p },
      };
    }

    // Check draw
    if (moves >= COLS * ROWS) {
      return {
        state: {
          turn: p,
          moves,
          lastMove,
          board: newBoard,
        },
        outcome: 'draw',
      };
    }

    return {
      state: {
        turn: (1 - p) as 0 | 1,
        moves,
        lastMove,
        board: newBoard,
      },
      outcome: 'continue',
    };
  },

  encodeAction(m: ConnectFourMove): Uint8Array {
    return new Uint8Array([m & 0xff]);
  },

  decodeState(buf: Uint8Array): ConnectFourState {
    const turn = (buf[0] & 1) as 0 | 1;
    const moves = buf[1];
    const lastCol = buf[2] === 255 ? null : buf[2];
    const lastRow = buf[3] === 255 ? null : buf[3];
    const lastMove =
      lastCol !== null && lastRow !== null ? { col: lastCol, row: lastRow } : null;

    const board: (0 | 1 | null)[][] = Array.from({ length: COLS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => {
        const val = buf[4 + c * ROWS + r];
        if (val === 1) return 0;
        if (val === 2) return 1;
        return null;
      })
    );

    return {
      turn,
      moves,
      lastMove,
      board,
    };
  },

  bot(level: 'easy' | 'medium' | 'hard') {
    return (state: ConnectFourState, p: 0 | 1) => getBotMove(level, state, p);
  },
};

export const connectFourUI: GameUI<ConnectFourState, ConnectFourMove> = {
  Board(props) {
    return React.createElement(ConnectFourBoard, props);
  },
};
