import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

type AuthStatus = 'unknown' | 'unauthenticated' | 'needs-setup' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  pendingEmail: string | null;
  pendingOtp: string | null;

  setStatus: (s: AuthStatus) => void;
  setUser: (user: User) => void;
  setPendingEmail: (email: string | null) => void;
  setPendingOtp: (otp: string | null) => void;
  updateName: (name: string) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'unknown',
      user: null,
      pendingEmail: null,
      pendingOtp: null,

      setStatus: (status) => set({ status }),

      setUser: (user) =>
        set({ user, status: user.phone ? 'authenticated' : 'needs-setup' }),

      setPendingEmail: (pendingEmail) => set({ pendingEmail }),

      setPendingOtp: (pendingOtp) => set({ pendingOtp }),

      updateName: (name) =>
        set((s) => ({
          user: s.user ? { ...s.user, name } : null,
          status: 'authenticated',
        })),

      reset: () =>
        set({ status: 'unauthenticated', user: null, pendingEmail: null, pendingOtp: null }),
    }),
    {
      name: 'splitease-auth',
      partialize: (s) => ({ user: s.user, pendingEmail: s.pendingEmail, pendingOtp: s.pendingOtp }),
    }
  )
);
