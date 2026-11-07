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
    const choices = [
      { id: 0 as const, label: '✊ Rock' },
      { id: 1 as const, label: '✋ Paper' },
      { id: 2 as const, label: '✌️ Scissors' },
    ];

    return React.createElement(
      'div',
      { className: 'space-y-4 text-center' },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between text-xs text-neutral-500 font-mono' },
        React.createElement('span', null, `You: Player ${me + 1}`),
        React.createElement(
          'span',
          null,
          `Round ${state.round + 1} (Score: ${state.scores[0]} - ${state.scores[1]})`
        )
      ),
      React.createElement(
        'p',
        { className: 'text-xs text-neutral-500 font-mono' },
        disabled ? 'Board inactive' : 'Choose your move:'
      ),
      React.createElement(
        'div',
        { className: 'flex justify-center gap-3' },
        ...choices.map((c) =>
          React.createElement(
            'button',
            {
              key: c.id,
              type: 'button',
              disabled,
              onClick: () => {
                const secret = new Uint8Array(32);
                if (typeof window !== 'undefined' && window.crypto) {
                  window.crypto.getRandomValues(secret);
                }
                onMove({ choice: c.id, secret });
              },
              className:
                'px-4 py-2.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-purple-600 hover:text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition',
            },
            c.label
          )
        )
      )
    );
  },
};

