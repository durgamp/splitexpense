import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/auth.store';
import { authApi, clearTokens } from '@/services/api';

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateName, reset } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2) { setNameError('Min 2 characters'); return; }
    setSaving(true);
    try {
      await authApi.setName(trimmed);
      updateName(trimmed);
      setEditing(false);
    } catch { setNameError('Failed to update'); }
    finally { setSaving(false); }
  }

  async function handleLogout() {
    if (!confirm('Sign out?')) return;
    const rt = localStorage.getItem('refreshToken') ?? '';
    try { await authApi.logout(rt); } catch { /* ignore */ }
    clearTokens();
    reset();
    navigate('/login');
  }

  return (
    <Layout>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900">Profile</h1>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 flex flex-col items-center gap-4">
          <Avatar name={user?.name ?? '?'} size={72} />

          {editing ? (
            <div className="w-full flex flex-col gap-3">
              <Input value={name} onChange={(e) => { setName(e.target.value); setNameError(''); }}
                placeholder="Your name" autoFocus error={nameError} />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setEditing(false); setName(user?.name ?? ''); }}>Cancel</Button>
                <Button loading={saving} onClick={saveName} fullWidth>Save</Button>
              </div>
            </div>
          ) : (
            <div className="text-center w-full">
              <div className="flex items-center gap-2 justify-center mb-3">
                <h2 className="text-xl font-bold text-gray-900">{user?.name}</h2>
                <button onClick={() => setEditing(true)} className="text-primary text-sm font-medium">Edit</button>
              </div>

              <div className="flex flex-col gap-2 text-sm text-gray-500">
                {user?.email && (
                  <div className="flex items-center gap-2 justify-center">
                    <span className="text-gray-400">✉</span>
                    <span>{user.email}</span>
                  </div>
                )}
                {user?.phone && (
                  <div className="flex items-center gap-2 justify-center">
                    <span className="text-gray-400">📱</span>
                    <span>{user.phone}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />
        <Button variant="danger" fullWidth size="lg" onClick={handleLogout}>Sign Out</Button>
      </div>
    </Layout>
  );
}
