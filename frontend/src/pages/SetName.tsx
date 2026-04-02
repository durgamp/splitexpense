import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi, setTokens } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function SetupProfile() {
  const navigate = useNavigate();
  const { setUser, user } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fullPhone = `${countryCode}${phone.replace(/\D/g, '')}`;
  const isValid = /^\+[1-9]\d{6,14}$/.test(fullPhone);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) { setError('Enter a valid phone number'); return; }

    setLoading(true);
    try {
      const { data } = await authApi.setup(fullPhone);
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      navigate('/');
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      const msg = typeof raw === 'string' ? raw : undefined;
      setError(msg ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <span className="text-5xl">📱</span>
        <h2 className="text-2xl font-bold text-gray-900 mt-4 mb-1">Add your phone number</h2>
        <p className="text-gray-500 text-sm mb-6">
          {user?.email && (
            <>Signed in as <strong>{user.email}</strong>.<br /></>
          )}
          Your phone number lets friends add you to groups and split expenses with you.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="w-16"
              maxLength={4}
            />
            <div className="flex-1">
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(''); }}
                placeholder="98765 43210"
                type="tel"
                autoFocus
                error={error}
              />
            </div>
          </div>

          <Button type="submit" fullWidth size="lg" loading={loading} disabled={!isValid}>
            Save & Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
