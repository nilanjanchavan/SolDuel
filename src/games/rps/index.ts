import React from 'react';
import { GameEngine, GameKind, GameUI, Outcome } from '../types';

export interface RpsState {
  scores: [number, number];
  round: number;
}

export type RpsMove = { choice: 0 | 1 | 2; secret: Uint8Array };

export const rpsEngine: GameEngine<RpsState, RpsMove> = {
  kind: GameKind.Rps,
  isSkill: false,
  init(firstPlayer: 0 | 1): RpsState {
    return {
      scores: [0, 0],
      round: 0,
    };
  },
  apply(s: RpsState, p: 0 | 1, m: RpsMove): { state: RpsState; outcome: Outcome } {
    return { state: s, outcome: 'continue' };
  },
  encodeAction(m: RpsMove): Uint8Array {
    return new Uint8Array([m.choice]);
  },
  decodeState(buf: Uint8Array): RpsState {
    return {
      scores: [0, 0],
      round: 0,
    };
  },
  bot(level: 'easy' | 'medium' | 'hard') {
    return (_s: RpsState, _p: 0 | 1) => ({ choice: 0, secret: new Uint8Array(32) });
  },
};

export const rpsUI: GameUI<RpsState, RpsMove> = {
  Board({ state, me, onMove, disabled }) {
    return React.createElement('div', { className: 'rps-board' }, 'Rock Paper Scissors Board Stub');
  },
};

