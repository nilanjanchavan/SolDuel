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
    return React.createElement(
      'div',
      { className: 'space-y-4 text-center' },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between text-xs text-neutral-500 font-mono' },
        React.createElement('span', null, `You: Player ${me + 1}`),
        React.createElement('span', null, `Last Rolls: [${state.rolls[0]}, ${state.rolls[1]}]`)
      ),
      React.createElement(
        'p',
        { className: 'text-xs text-neutral-500 font-mono' },
        disabled ? 'Board inactive' : 'Roll the dice to commit your seed:'
      ),
      React.createElement(
        'div',
        { className: 'flex justify-center' },
        React.createElement(
          'button',
          {
            type: 'button',
            disabled,
            onClick: () => {
              const secret = new Uint8Array(32);
              if (typeof window !== 'undefined' && window.crypto) {
                window.crypto.getRandomValues(secret);
              }
              onMove({ secret });
            },
            className:
              'px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition',
          },
          '🎲 Roll Dice'
        )
      )
    );
  },
};

