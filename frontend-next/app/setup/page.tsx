'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi, setTokens } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function SetupPage() {
  const router = useRouter();
  const { status, user, updateName, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; submit?: string }>({});

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim() || name.trim().length < 2) errs.name = 'Enter your full name (min 2 chars)';
    const phoneRaw = phone.trim();
    if (!phoneRaw) errs.phone = 'Enter your phone number';
    else if (!/^\+[1-9]\d{6,14}$/.test(phoneRaw)) errs.phone = 'Use international format: +91XXXXXXXXXX';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      // Set name first, then phone (phone setup issues new tokens)
      await authApi.setName(name.trim());
      const phoneRes = await authApi.setup(phoneRaw);
      // Store new tokens — phone setup rotates the access token with phone claim
      if (phoneRes.data.accessToken && phoneRes.data.refreshToken) {
        setTokens(phoneRes.data.accessToken, phoneRes.data.refreshToken);
      }
      const freshUser = phoneRes.data.user;
      if (freshUser) setUser(freshUser);
      else updateName(name.trim());
      router.replace('/dashboard');
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setErrors({ submit: typeof raw === 'string' ? raw : 'Setup failed. Try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-indigo-600">SplitEase</h1>
          <p className="text-gray-400 mt-2">Almost there — set up your profile.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Your Profile</h2>

          <Input
            label="Full name"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((v) => ({ ...v, name: '' })); }}
            placeholder="e.g. Priya Sharma"
            autoFocus
            error={errors.name}
          />

          <div className="flex flex-col gap-1">
            <Input
              label="Phone number"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setErrors((v) => ({ ...v, phone: '' })); }}
              placeholder="+91XXXXXXXXXX"
              type="tel"
              inputMode="tel"
              error={errors.phone}
            />
            <p className="text-xs text-gray-400">Include country code, e.g. +91 for India</p>
          </div>

          {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}
          <Button type="submit" fullWidth size="lg" loading={loading}>Continue</Button>
        </form>
      </div>
    </div>
  );
}
