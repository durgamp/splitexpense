import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { authApi, setTokens } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

const OTP_LEN = 6;
const COOLDOWN = 30;

export default function OTP() {
  const navigate = useNavigate();
  const { pendingPhone, setUser, setPendingPhone, status } = useAuthStore();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(COOLDOWN);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Only bounce to login if there's no pending phone AND we're not mid-verification
    if (!pendingPhone && status !== 'authenticated' && status !== 'needs-name') {
      navigate('/login');
    }
  }, [pendingPhone, status]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(code: string) {
    if (code.length !== OTP_LEN) return;
    setError(''); setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(pendingPhone!, code);
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      setPendingPhone(null);
      navigate(data.isNewUser || !data.user.name ? '/set-name' : '/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Invalid code'); setOtp('');
    } finally { setLoading(false); }
  }

  async function resend() {
    if (cooldown > 0 || !pendingPhone) return;
    try { await authApi.requestOtp(pendingPhone); setCooldown(COOLDOWN); setError(''); }
    catch { setError('Failed to resend'); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <button onClick={() => navigate('/login')} className="text-primary text-sm font-medium mb-8">← Back</button>

        <h2 className="text-2xl font-bold text-gray-900 mb-1">Enter the code</h2>
        <p className="text-gray-500 text-sm mb-3">Sent to {pendingPhone}</p>

        {import.meta.env.DEV && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 mb-5 text-sm flex items-center gap-2">
            <span className="text-yellow-700">Dev mode — OTP is always</span>
            <span className="font-mono font-bold text-yellow-900 text-base tracking-widest">123456</span>
          </div>
        )}

        {/* Hidden real input */}
        <input ref={inputRef} value={otp} onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LEN);
          setOtp(v); setError('');
          if (v.length === OTP_LEN) verify(v);
        }} className="absolute opacity-0 w-0 h-0" autoFocus inputMode="numeric" />

        {/* Visual boxes */}
        <div className="flex gap-2 justify-center mb-6 cursor-text" onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: OTP_LEN }).map((_, i) => (
            <div key={i} className={[
              'w-12 h-14 flex items-center justify-center rounded-xl border-2 text-xl font-bold transition-colors',
              otp[i] ? 'border-primary bg-primary-light text-primary' : 'border-gray-200 bg-white text-gray-900',
              i === otp.length ? 'border-primary border-2 ring-2 ring-primary/20' : '',
              error ? 'border-red-400' : '',
            ].join(' ')}>
              {otp[i] ?? ''}
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

        <Button fullWidth size="lg" loading={loading} disabled={otp.length !== OTP_LEN}
          onClick={() => verify(otp)}>
          Verify
        </Button>

        <button onClick={resend} disabled={cooldown > 0}
          className="w-full text-center text-sm mt-4 text-primary disabled:text-gray-400 font-medium">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get it? Resend"}
        </button>
      </div>
    </div>
  );
}
