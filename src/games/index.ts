import { GameKind, RegisteredGame } from './types';
import { connectFourEngine, connectFourUI } from './connect-four';
import { wordChainEngine, wordChainUI } from './word-chain';
import { rpsEngine, rpsUI } from './rps';
import { diceEngine, diceUI } from './dice';

export * from './types';

export const GAME_REGISTRY: Record<GameKind, RegisteredGame> = {
  [GameKind.ConnectFour]: {
    engine: connectFourEngine,
    ui: connectFourUI,
  },
  [GameKind.WordChain]: {
    engine: wordChainEngine,
    ui: wordChainUI,
  },
  [GameKind.Rps]: {
    engine: rpsEngine,
    ui: rpsUI,
  },
  [GameKind.Dice]: {
    engine: diceEngine,
    ui: diceUI,
  },
};

export function getGame(kind: GameKind): RegisteredGame {
  const game = GAME_REGISTRY[kind];
  if (!game) {
    throw new Error(`Unknown game kind: ${kind}`);
  }
  return game;
}

