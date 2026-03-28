import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export default function SetName() {
  const navigate = useNavigate();
  const { updateName } = useAuthStore();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError('Enter at least 2 characters'); return; }
    setLoading(true);
    try {
      await authApi.setName(trimmed);
      updateName(trimmed);
      navigate('/');
    } catch { setError('Something went wrong. Try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <span className="text-5xl">👋</span>
        <h2 className="text-2xl font-bold text-gray-900 mt-4 mb-2">What's your name?</h2>
        <p className="text-gray-500 text-sm mb-6">This is how your friends will see you in groups.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="Your full name" autoFocus autoCapitalize="words" error={error} />
          <Button type="submit" fullWidth size="lg" loading={loading} disabled={name.trim().length < 2}>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
