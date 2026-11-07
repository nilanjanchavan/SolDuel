import React from 'react';
import { GameEngine, GameKind, GameUI, Outcome } from '../types';

export interface DiceState {
  rolls: [number, number];
}

export type DiceMove = { secret: Uint8Array };

export const diceEngine: GameEngine<DiceState, DiceMove> = {
  kind: GameKind.Dice,
  isSkill: false,
  init(firstPlayer: 0 | 1): DiceState {
    return {
      rolls: [0, 0],
    };
  },
  apply(s: DiceState, p: 0 | 1, m: DiceMove): { state: DiceState; outcome: Outcome } {
    return { state: s, outcome: 'continue' };
  },
  encodeAction(m: DiceMove): Uint8Array {
    return m.secret;
  },
  decodeState(buf: Uint8Array): DiceState {
    return {
      rolls: [0, 0],
    };
  },
  bot(level: 'easy' | 'medium' | 'hard') {
    return (_s: DiceState, _p: 0 | 1) => ({ secret: new Uint8Array(32) });
  },
};

export const diceUI: GameUI<DiceState, DiceMove> = {
  Board({ state, me, onMove, disabled }) {
    return React.createElement('div', { className: 'dice-board' }, 'Dice Duel Board Stub');
  },
};

