import React from 'react';
import { GameEngine, GameKind, GameUI, Outcome } from '../types';

export interface WordChainState {
  currentTurn: 0 | 1;
  strikes: [number, number];
  lastWord: string;
}

export type WordChainMove = string;

export const wordChainEngine: GameEngine<WordChainState, WordChainMove> = {
  kind: GameKind.WordChain,
  isSkill: true,
  init(firstPlayer: 0 | 1): WordChainState {
    return {
      currentTurn: firstPlayer,
      strikes: [0, 0],
      lastWord: '',
    };
  },
  apply(s: WordChainState, p: 0 | 1, m: WordChainMove): { state: WordChainState; outcome: Outcome } {
    return { state: s, outcome: 'continue' };
  },
  encodeAction(m: WordChainMove): Uint8Array {
    return new TextEncoder().encode(m);
  },
  decodeState(buf: Uint8Array): WordChainState {
    return {
      currentTurn: 0,
      strikes: [0, 0],
      lastWord: '',
    };
  },
  bot(level: 'easy' | 'medium' | 'hard') {
    return (_s: WordChainState, _p: 0 | 1) => 'sol';
  },
};

export const wordChainUI: GameUI<WordChainState, WordChainMove> = {
  Board({ state, me, onMove, disabled }) {
    const [word, setWord] = React.useState('');
    const isMyTurn = state.currentTurn === me;

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = word.trim().toLowerCase();
      if (trimmed && isMyTurn && !disabled) {
        onMove(trimmed);
        setWord('');
      }
    };

    return React.createElement(
      'div',
      { className: 'space-y-4 text-center max-w-sm mx-auto' },
      React.createElement(
        'div',
        { className: 'flex items-center justify-between text-xs text-neutral-500 font-mono' },
        React.createElement('span', null, `You: Player ${me + 1}`),
        React.createElement(
          'span',
          { className: isMyTurn ? 'text-purple-600 dark:text-purple-400 font-semibold' : '' },
          disabled ? 'Board inactive' : isMyTurn ? 'Your turn to play a word' : "Opponent's turn"
        )
      ),
      state.lastWord
        ? React.createElement(
            'div',
            { className: 'text-sm font-medium' },
            'Last Word: ',
            React.createElement(
              'span',
              { className: 'font-mono text-purple-600 dark:text-purple-400 font-bold' },
              state.lastWord
            )
          )
        : null,
      React.createElement(
        'form',
        { onSubmit: handleSubmit, className: 'flex gap-2' },
        React.createElement('input', {
          type: 'text',
          value: word,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setWord(e.target.value),
          placeholder: 'Enter next word...',
          disabled: disabled || !isMyTurn,
          className:
            'flex-1 px-3 py-2 text-sm border rounded-lg bg-transparent border-neutral-300 dark:border-neutral-700 disabled:opacity-50',
        }),
        React.createElement(
          'button',
          {
            type: 'submit',
            disabled: disabled || !isMyTurn || !word.trim(),
            className:
              'px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition',
          },
          'Play Word'
        )
      )
    );
  },
};

