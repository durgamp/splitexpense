import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function ForgotPassword() {
  const navigate = useNavigate();
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
      navigate('/otp');
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
          <p className="text-gray-400 mt-2">Recover your account access.</p>
        </div>

        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Forgot Password?</h2>
          <p className="text-gray-500 text-sm">
            Enter your email address and we'll send you a one-time code to sign back in.
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
            onClick={() => navigate('/login')}
            className="text-sm text-center text-primary hover:text-primary-dark transition-colors">
            Back to Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
