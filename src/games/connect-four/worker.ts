import { getBotMove } from './bot';
import { ConnectFourState } from './types';

// Web Worker handler for off-thread bot move computation
if (typeof self !== 'undefined') {
  self.onmessage = (
    e: MessageEvent<{ level: 'easy' | 'medium' | 'hard'; state: ConnectFourState; player: 0 | 1 }>
  ) => {
    const { level, state, player } = e.data;
    const move = getBotMove(level, state, player);
    self.postMessage({ move });
  };
}
