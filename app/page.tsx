'use client';

import { useUserId } from '@/hooks/useUserId';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

export default function Home() {
  useUserId(); // Initialize user ID
  const router = useRouter();

  const handleCreateSession = () => {
    const roomId = nanoid();
    router.push(`/room/${roomId}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-6 text-center">
          <button
            onClick={handleCreateSession}
            className="px-8 py-4 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            Create new session
          </button>
        </div>
      </main>
    </div>
  );
}
