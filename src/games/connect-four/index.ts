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
    return React.createElement('div', { className: 'connect-four-board' }, 'Connect Four Board Stub');
  },
};

