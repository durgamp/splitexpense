'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export default function Root() {
  const router = useRouter();
  const { status, user } = useAuthStore();

  useEffect(() => {
    if (status === 'unknown') {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      if (!accessToken && !refreshToken) {
        useAuthStore.getState().reset();
      } else if (user) {
        useAuthStore.getState().setStatus(user.phone ? 'authenticated' : 'needs-setup');
      } else {
        useAuthStore.getState().reset();
      }
      return;
    }
    if (status === 'unauthenticated') router.replace('/login');
    else if (status === 'needs-setup') router.replace('/setup');
    else if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router, user]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
