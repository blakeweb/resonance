'use client';

import { nanoid } from 'nanoid';
import { useState } from 'react';

const USER_ID_KEY = 'resonance-user-id';

export function useUserId() {
  const [userId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;

    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = nanoid();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  });

  return userId;
}