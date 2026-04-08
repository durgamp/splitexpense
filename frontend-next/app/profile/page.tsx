'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authApi, clearTokens } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

function ProfileContent() {
  const router = useRouter();
  const { user, updateName, reset } = useAuthStore();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) { setError('Name must be at least 2 characters'); return; }
    setSaving(true);
    try {
      await authApi.setName(trimmed);
      updateName(trimmed);
      setEditName(false);
    } catch { setError('Failed to update name'); }
    finally { setSaving(false); }
  }

  async function handleLogout() {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch { /* ignore */ }
    clearTokens();
    reset();
    router.replace('/login');
  }

  return (
    <Layout>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-10">
        <h1 className="text-lg font-bold text-gray-900">Profile</h1>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Avatar + info */}
        <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center gap-3">
          <Avatar name={user?.name ?? '?'} size={72} />
          {editName ? (
            <form onSubmit={saveName} className="w-full flex flex-col gap-3">
              <Input value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="Full name" autoFocus error={error} />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => { setEditName(false); setName(user?.name ?? ''); }}>
                  Cancel
                </Button>
                <Button type="submit" fullWidth loading={saving}>Save</Button>
              </div>
            </form>
          ) : (
            <>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{user?.name || '—'}</p>
                <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
                <p className="text-sm text-gray-400">{user?.phone || 'No phone set'}</p>
              </div>
              <button onClick={() => setEditName(true)}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                Edit name
              </button>
            </>
          )}
        </div>

        {/* Account info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Account</p>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-gray-600">Email</span>
            <span className="text-sm font-medium text-gray-900">{user?.email}</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-sm text-gray-600">Phone</span>
            <span className="text-sm font-medium text-gray-900">{user?.phone || '—'}</span>
          </div>
        </div>

        {/* Logout */}
        <Button variant="danger" fullWidth onClick={handleLogout}>Sign Out</Button>
      </div>
    </Layout>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
