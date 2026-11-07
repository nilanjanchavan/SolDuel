import { Suspense } from 'react';
import { SolduelLobby } from '@/components/solduel/solduel-lobby';

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-neutral-500">
          Loading SolDuel Lobby...
        </div>
      }
    >
      <SolduelLobby />
    </Suspense>
  );
}
