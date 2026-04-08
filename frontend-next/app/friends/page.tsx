'use client';
import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { friendsApi } from '@/services/api';

interface Friend { phone: string; name: string; userId: string | null; }

function FriendsContent() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    friendsApi.list()
      .then(({ data }) => setFriends(data.friends ?? []))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const phoneRaw = phone.trim();
    const nameRaw = name.trim();
    const errs: Record<string, string> = {};
    if (!phoneRaw) errs.phone = 'Enter phone number';
    else if (!/^\+[1-9]\d{6,14}$/.test(phoneRaw)) errs.phone = 'Use international format: +91XXXXXXXXXX';
    if (!nameRaw) errs.name = 'Enter name';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setAdding(true);
    try {
      const { data } = await friendsApi.add(phoneRaw, nameRaw);
      if (data.friend) setFriends((prev) => [data.friend, ...prev]);
      setPhone(''); setName(''); setShowAdd(false);
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setErrors({ submit: typeof raw === 'string' ? raw : 'Failed to add friend' });
    } finally {
      setAdding(false);
    }
  }

  return (
    <Layout>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
        <h1 className="text-lg font-bold text-gray-900">Friends</h1>
        <button onClick={() => setShowAdd((v) => !v)}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {showAdd && (
          <form onSubmit={handleAdd} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            <p className="text-sm font-semibold text-gray-700">Add a friend</p>
            <Input label="Phone" value={phone}
              onChange={(e) => { setPhone(e.target.value); setErrors((v) => ({ ...v, phone: '' })); }}
              placeholder="+91XXXXXXXXXX" type="tel" inputMode="tel" error={errors.phone} autoFocus />
            <Input label="Name" value={name}
              onChange={(e) => { setName(e.target.value); setErrors((v) => ({ ...v, name: '' })); }}
              placeholder="e.g. Rahul" error={errors.name} />
            {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}
            <Button type="submit" fullWidth loading={adding}>Add Friend</Button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center gap-3">
            <span className="text-5xl">👥</span>
            <p className="text-gray-500 font-medium">No friends yet</p>
            <p className="text-gray-400 text-sm">Add friends to split expenses directly.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {friends.map((f) => (
              <div key={f.phone} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={f.name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400">{f.phone}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function FriendsPage() {
  return (
    <AuthGuard>
      <FriendsContent />
    </AuthGuard>
  );
}
