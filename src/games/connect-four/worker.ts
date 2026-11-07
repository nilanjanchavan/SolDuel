import { getBotMove } from './bot';
import { ConnectFourState } from './types';

/**
 * Message payload structure sent to the Connect Four bot Web Worker.
 */
export interface BotWorkerRequest {
  id?: string | number;
  level: 'easy' | 'medium' | 'hard';
  state: ConnectFourState;
  player: 0 | 1;
}

/**
 * Message payload structure returned from the Connect Four bot Web Worker.
 */
export interface BotWorkerResponse {
  id?: string | number;
  move?: number;
  error?: string;
}

// Web Worker handler for off-thread bot move computation
if (typeof self !== 'undefined') {
  self.onmessage = (e: MessageEvent<BotWorkerRequest>) => {
    const { id, level, state, player } = e.data;
    try {
      const move = getBotMove(level, state, player);
      self.postMessage({ id, move } as BotWorkerResponse);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ id, error } as BotWorkerResponse);
    }
  };
}
