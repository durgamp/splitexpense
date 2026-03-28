import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function Login() {
  const navigate = useNavigate();
  const { setPendingPhone } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devOtp, setDevOtp] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const full = `${countryCode}${phone.replace(/\D/g, '')}`;
    if (!/^\+[1-9]\d{6,14}$/.test(full)) { setError('Enter a valid phone number'); return; }

    setError(''); setLoading(true);
    try {
      const { data } = await authApi.requestOtp(full);
      setPendingPhone(full);
      if (data.otp) setDevOtp(data.otp); // development only
      navigate('/otp');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
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
          <h2 className="text-2xl font-bold text-gray-900">Enter your number</h2>
          <p className="text-gray-500 text-sm">We'll send a one-time code to verify it's you.</p>

          <div className="flex gap-2">
            <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)}
              className="w-16" maxLength={4} />
            <div className="flex-1">
              <Input value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }}
                placeholder="98765 43210" type="tel" autoFocus error={error} />
            </div>
          </div>

          {import.meta.env.DEV && devOtp && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm">
              <span className="font-medium text-yellow-800">Dev OTP: </span>
              <span className="font-mono font-bold text-yellow-900">{devOtp}</span>
            </div>
          )}

          <Button type="submit" fullWidth size="lg" loading={loading}>
            Send OTP
          </Button>

          <p className="text-xs text-center text-gray-400">
            By continuing, you agree to our Terms & Privacy Policy.
          </p>
        </form>
      </div>
    </div>
  );
}
