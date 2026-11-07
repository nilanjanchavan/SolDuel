import { ReactElement } from 'react';

export enum GameKind {
  ConnectFour = 0,
  WordChain = 1,
  Rps = 2,
  Dice = 3,
}

export type Outcome = 'continue' | 'draw' | { win: 0 | 1 };

export interface GameEngine<S, M> {
  kind: GameKind;
  isSkill: boolean;
  init(firstPlayer: 0 | 1): S;
  apply(s: S, p: 0 | 1, m: M): { state: S; outcome: Outcome };
  encodeAction(m: M): Uint8Array;       // must match the Rust `data` format
  decodeState(buf: Uint8Array): S;      // must match the Rust state layout
  bot(level: 'easy' | 'medium' | 'hard'): (s: S, p: 0 | 1) => M;
}

export interface GameUI<S, M> {
  Board(props: { state: S; me: 0 | 1; onMove(m: M): void; disabled: boolean }): ReactElement;
}

export interface RegisteredGame<S = any, M = any> {
  engine: GameEngine<S, M>;
  ui: GameUI<S, M>;
}

