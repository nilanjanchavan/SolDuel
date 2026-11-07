import React from 'react';
import { GameEngine, GameKind, GameUI, Outcome } from '../types';

export interface ConnectFourState {
  board: number[][]; // 7 cols x 6 rows
  currentTurn: 0 | 1;
}

export type ConnectFourMove = number; // Column index (0..6)

export const connectFourEngine: GameEngine<ConnectFourState, ConnectFourMove> = {
  kind: GameKind.ConnectFour,
  isSkill: true,
  init(firstPlayer: 0 | 1): ConnectFourState {
    return {
      board: Array(7).fill(null).map(() => Array(6).fill(-1)),
      currentTurn: firstPlayer,
    };
  },
  apply(s: ConnectFourState, p: 0 | 1, m: ConnectFourMove): { state: ConnectFourState; outcome: Outcome } {
    return { state: s, outcome: 'continue' };
  },
  encodeAction(m: ConnectFourMove): Uint8Array {
    return new Uint8Array([m]);
  },
  decodeState(buf: Uint8Array): ConnectFourState {
    return {
      board: Array(7).fill(null).map(() => Array(6).fill(-1)),
      currentTurn: 0,
    };
  },
  bot(level: 'easy' | 'medium' | 'hard') {
    return (_s: ConnectFourState, _p: 0 | 1) => 0;
  },
};

export const connectFourUI: GameUI<ConnectFourState, ConnectFourMove> = {
  Board({ state, me, onMove, disabled }) {
    const isMyTurn = state.currentTurn === me;
    return React.createElement(
      'div',
      { className: 'space-y-4 text-center' },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between text-xs text-neutral-500 font-mono' },
        React.createElement('span', null, `You: Player ${me === 0 ? '1 (Red)' : '2 (Yellow)'}`),
        React.createElement(
          'span',
          { className: isMyTurn ? 'text-purple-600 dark:text-purple-400 font-semibold' : '' },
          disabled ? 'Board inactive' : isMyTurn ? 'Your turn to drop a piece' : "Opponent's turn"
        )
      ),
      React.createElement(
        'div',
        { className: 'inline-grid grid-cols-7 gap-1.5 p-3 bg-neutral-200 dark:bg-neutral-900 rounded-xl' },
        ...Array.from({ length: 7 }, (_, col) =>
          React.createElement(
            'div',
            { key: col, className: 'flex flex-col gap-1.5 items-center' },
            React.createElement(
              'button',
              {
                type: 'button',
                disabled: disabled || !isMyTurn,
                onClick: () => onMove(col),
                'aria-label': `Drop in column ${col + 1}`,
                className:
                  'w-8 h-8 rounded-lg bg-neutral-300 dark:bg-neutral-800 hover:bg-purple-600 hover:text-white disabled:opacity-40 disabled:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-800 transition font-mono text-xs font-bold',
              },
              `${col + 1}`
            ),
            ...Array.from({ length: 6 }, (_, row) => {
              const cell = state.board[col]?.[5 - row] ?? -1;
              const bgClass =
                cell === 0 ? 'bg-red-500' : cell === 1 ? 'bg-amber-400' : 'bg-white dark:bg-neutral-950';
              return React.createElement('div', {
                key: row,
                className: `w-8 h-8 rounded-full border border-neutral-300 dark:border-neutral-700 ${bgClass}`,
              });
            })
          )
        )
      )
    );
  },
};

