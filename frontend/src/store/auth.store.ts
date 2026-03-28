import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

type AuthStatus = 'unknown' | 'unauthenticated' | 'needs-name' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  pendingPhone: string | null;

  setStatus: (s: AuthStatus) => void;
  setUser: (user: User) => void;
  setPendingPhone: (phone: string | null) => void;
  updateName: (name: string) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'unknown',
      user: null,
      pendingPhone: null,

      setStatus: (status) => set({ status }),

      setUser: (user) =>
        set({ user, status: user.name ? 'authenticated' : 'needs-name' }),

      setPendingPhone: (pendingPhone) => set({ pendingPhone }),

      updateName: (name) =>
        set((s) => ({
          user: s.user ? { ...s.user, name } : null,
          status: 'authenticated',
        })),

      reset: () =>
        set({ status: 'unauthenticated', user: null, pendingPhone: null }),
    }),
    {
      name: 'splitease-auth',
      // Only persist user data, not ephemeral status
      partialize: (s) => ({ user: s.user, pendingPhone: s.pendingPhone }),
    }
  )
);
