'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { GuestGuard } from '@/components/AuthGuard';
import { authApi, setTokens } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

function OtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');
  const { pendingEmail, pendingOtp, setUser, reset } = useAuthStore();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!pendingEmail) { router.replace('/login'); return; }
    refs.current[0]?.focus();
    // In dev mode, auto-fill if OTP exposed
    if (pendingOtp && pendingOtp.length === 6) {
      setCode(pendingOtp.split(''));
    }
  }, []);

  const fullCode = code.join('');

  function handleChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    setError('');
    if (digit && i < 5) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (digits.length > 0) {
      const next = digits.split('').concat(Array(6).fill('')).slice(0, 6);
      setCode(next);
      refs.current[Math.min(digits.length, 5)]?.focus();
    }
    e.preventDefault();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (fullCode.length < 6) { setError('Enter the 6-digit code'); return; }
    if (!pendingEmail) { router.replace('/login'); return; }
    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(pendingEmail, fullCode);
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      if (invite) router.replace(`/invite/${invite}`);
      else if (!data.user.phone) router.replace('/setup');
      else if (!data.user.name) router.replace('/setup');
      else router.replace('/dashboard');
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setError(typeof raw === 'string' ? raw : 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!pendingEmail) return;
    setResending(true);
    try {
      const { data } = await authApi.requestOtp(pendingEmail);
      useAuthStore.getState().setPendingOtp(data.otp ?? null);
      setResent(true);
      setCode(['', '', '', '', '', '']);
      refs.current[0]?.focus();
      setTimeout(() => setResent(false), 3000);
    } catch { /* ignore */ }
    finally { setResending(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">SplitEase</h1>
        </div>
        <form onSubmit={handleVerify} className="flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Enter code</h2>
            <p className="text-gray-500 text-sm mt-1">
              Sent to <span className="font-medium text-gray-700">{pendingEmail}</span>
            </p>
          </div>

          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {code.map((d, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-white focus:outline-none transition-colors
                  ${d ? 'border-indigo-500 text-indigo-700' : 'border-gray-200 text-gray-900'}
                  focus:border-indigo-500`}
              />
            ))}
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <Button type="submit" fullWidth size="lg" loading={loading}>Verify</Button>

          <div className="text-center">
            {resent ? (
              <p className="text-sm text-green-600 font-medium">Code resent!</p>
            ) : (
              <button type="button" onClick={handleResend} disabled={resending}
                className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors">
                {resending ? 'Resending…' : 'Resend code'}
              </button>
            )}
          </div>
          <button type="button" onClick={() => { reset(); router.replace('/login'); }}
            className="text-sm text-center text-gray-400 hover:text-gray-600 transition-colors">
            Use a different email
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OtpPage() {
  return (
    <GuestGuard>
      <OtpForm />
    </GuestGuard>
  );
}
