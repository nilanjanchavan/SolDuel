import { Suspense } from 'react';
import { SolduelLobby } from '@/components/solduel/solduel-lobby';

/**
 * Root home page rendering the matchmaking and custom room lobby.
 */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-4xl py-12 text-center text-neutral-500">
          Loading lobby...
        </div>
      }
    >
      <SolduelLobby />
    </Suspense>
  );
}
