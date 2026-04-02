import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
      navigate(invite ? `/otp?invite=${invite}` : '/otp');
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      const msg = typeof raw === 'string' ? raw : undefined;
      setError(msg ?? 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary">SplitEase</h1>
          <p className="text-gray-400 mt-2">Split expenses, not friendships.</p>
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
          <p className="text-gray-500 text-sm">We'll send a one-time code to your email.</p>

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

          <p className="text-xs text-center text-gray-400">
            By continuing, you agree to our Terms &amp; Privacy Policy.
          </p>
        </form>
      </div>
    </div>
  );
}
