'use client';

import React, { useState } from 'react';
import { ConnectFourState, ConnectFourMove } from './types';
import { COLS, ROWS, getLowestEmptyRow } from './bot';

export interface BoardProps {
  state: ConnectFourState;
  me: 0 | 1;
  onMove: (m: ConnectFourMove) => void;
  disabled: boolean;
}

export function ConnectFourBoard({ state, me, onMove, disabled }: BoardProps) {
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const isMyTurn = state.turn === me && !disabled;

  const handleColumnClick = (col: number) => {
    if (!isMyTurn) return;
    const lowestRow = getLowestEmptyRow(state.board, col);
    if (lowestRow === -1) return; // Column full
    onMove(col);
  };

  const getDiscColor = (player: 0 | 1 | null) => {
    if (player === 0) return 'bg-red-500 shadow-md ring-2 ring-red-400/50';
    if (player === 1) return 'bg-amber-400 shadow-md ring-2 ring-amber-300/50';
    return 'bg-neutral-200 dark:bg-neutral-800';
  };

  return (
    <div className="flex flex-col items-center select-none space-y-4">
      {/* Turn indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`h-3 w-3 rounded-full ${
            state.turn === 0 ? 'bg-red-500' : 'bg-amber-400'
          }`}
        />
        <span className="font-semibold text-sm">
          {isMyTurn ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              Your Turn — Select a column to drop a piece
            </span>
          ) : (
            <span className="text-neutral-500">
              Opponent’s Turn ({state.turn === 0 ? 'Player 1' : 'Player 2'})
            </span>
          )}
        </span>
      </div>

      {/* Hover preview bar */}
      <div className="grid grid-cols-7 gap-2 sm:gap-3 w-full max-w-sm h-8 px-2">
        {Array.from({ length: COLS }).map((_, col) => {
          const isAvailable = getLowestEmptyRow(state.board, col) !== -1;
          const showGhost = hoverCol === col && isMyTurn && isAvailable;
          return (
            <div key={col} className="flex justify-center items-center">
              {showGhost && (
                <div
                  className={`h-7 w-7 rounded-full opacity-60 animate-bounce ${
                    me === 0 ? 'bg-red-500' : 'bg-amber-400'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Grid Board */}
      <div className="bg-blue-600 dark:bg-blue-700 p-3 sm:p-4 rounded-2xl shadow-xl border-4 border-blue-700 dark:border-blue-800 max-w-sm w-full">
        <div className="grid grid-cols-7 gap-2 sm:gap-3">
          {Array.from({ length: COLS }).map((_, col) => {
            const isColFull = getLowestEmptyRow(state.board, col) === -1;
            const canClick = isMyTurn && !isColFull;

            return (
              <div
                key={col}
                onClick={() => canClick && handleColumnClick(col)}
                onMouseEnter={() => setHoverCol(col)}
                onMouseLeave={() => setHoverCol(null)}
                className={`flex flex-col-reverse gap-2 sm:gap-3 rounded-xl transition ${
                  canClick
                    ? 'cursor-pointer hover:bg-blue-500/30'
                    : 'cursor-not-allowed'
                }`}
              >
                {Array.from({ length: ROWS }).map((_, row) => {
                  const cell = state.board[col][row];
                  const isLastMove =
                    state.lastMove?.col === col && state.lastMove?.row === row;

                  return (
                    <div
                      key={row}
                      className="aspect-square relative rounded-full flex items-center justify-center p-0.5"
                    >
                      <div
                        className={`w-full h-full rounded-full transition-transform duration-200 ${getDiscColor(
                          cell
                        )} ${isLastMove ? 'scale-105 ring-4 ring-white' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
