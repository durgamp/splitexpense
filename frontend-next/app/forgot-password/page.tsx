'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GuestGuard } from '@/components/AuthGuard';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

function ForgotPasswordForm() {
  const router = useRouter();
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
      router.push('/login/otp');
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setError(typeof raw === 'string' ? raw : 'Failed to send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-indigo-600">SplitEase</h1>
          <p className="text-gray-400 mt-2">Recover your account access.</p>
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Forgot Password?</h2>
          <p className="text-gray-500 text-sm">
            Enter your email and we&apos;ll send a one-time code to sign back in.
          </p>

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

          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-sm text-center text-indigo-600 hover:text-indigo-800 transition-colors font-medium"
          >
            Back to Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <GuestGuard>
      <ForgotPasswordForm />
    </GuestGuard>
  );
}
