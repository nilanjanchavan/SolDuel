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
    return React.createElement('div', { className: 'word-chain-board' }, 'Word Chain Board Stub');
  },
};

