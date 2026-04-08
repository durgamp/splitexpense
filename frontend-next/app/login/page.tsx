'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GuestGuard } from '@/components/AuthGuard';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');
  const { setPendingEmail, setPendingOtp } = useAuthStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address');
      return;
    }
    setError(''); setLoading(true);
    try {
      const { data } = await authApi.requestOtp(trimmed);
      setPendingEmail(trimmed);
      setPendingOtp(data.otp ?? null);
      router.push(invite ? `/login/otp?invite=${invite}` : '/login/otp');
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setError(typeof raw === 'string' ? raw : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-indigo-600">SplitEase</h1>
          <p className="text-gray-400 mt-2">Split expenses, not friendships.</p>
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
          <p className="text-gray-500 text-sm">We&apos;ll send a one-time code to your email.</p>

          <Input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="you@example.com"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            error={error}
          />

          <Button type="submit" fullWidth size="lg" loading={loading}>
            Send OTP
          </Button>

          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-400">
              By continuing you agree to our Terms &amp; Privacy Policy.
            </p>
            <Link
              href="/forgot-password"
              className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors shrink-0 ml-2 font-medium"
            >
              Forgot Password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <GuestGuard>
      <LoginForm />
    </GuestGuard>
  );
}
