import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/store/auth.store';
import { useGroupStore } from '@/store/group.store';
import { groupsApi } from '@/services/api';

interface Member { phone: string; name: string; }

function normalizePhone(raw: string, cc = '+91'): string | null {
  const s = raw.replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
  if (s.length === 10 && /^[6-9]/.test(s)) return `${cc}${s}`;
  return null;
}

export default function CreateGroup() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { upsertGroup } = useGroupStore();
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addMember() {
    const phone = normalizePhone(phoneInput);
    if (!phone) { setPhoneError('Invalid phone number'); return; }
    if (phone === user?.phone || members.some((m) => m.phone === phone)) {
      setPhoneError('Already added'); return;
    }
    setMembers([...members, { phone, name: nameInput.trim() || phone }]);
    setPhoneInput(''); setNameInput(''); setPhoneError('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) { setError('Give your group a name'); return; }
    setLoading(true);
    try {
      const { data } = await groupsApi.create(groupName.trim(), members);
      upsertGroup(data.group);
      navigate(`/group/${data.group.id}`);
    } catch { setError('Failed to create group'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">✕</button>
        <h1 className="font-bold text-gray-900 flex-1">New Group</h1>
      </div>

      <form onSubmit={handleCreate} className="p-4 flex flex-col gap-5">
        <Input label="Group name" value={groupName}
          onChange={(e) => { setGroupName(e.target.value); setError(''); }}
          placeholder="Goa Trip, Flat 3B…" autoFocus error={error} />

        {/* Creator chip */}
        {user && (
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2">Members</p>
            <div className="flex items-center gap-2 bg-primary-light rounded-full px-3 py-1 w-fit">
              <Avatar name={user.name} size={24} />
              <span className="text-sm font-medium text-primary-dark">{user.name} (you)</span>
            </div>
          </div>
        )}

        {/* Selected members */}
        {members.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <div key={m.phone} className="flex items-center gap-2 bg-primary-light rounded-full px-3 py-1">
                <Avatar name={m.name} size={24} />
                <span className="text-sm font-medium text-primary-dark">{m.name}</span>
                <button type="button" onClick={() => setMembers(members.filter((x) => x.phone !== m.phone))}
                  className="text-primary-dark text-xs ml-1">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Add member form */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-500">Add members</p>
          <Input value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setPhoneError(''); }}
            placeholder="+91 98765 43210" type="tel" error={phoneError} />
          <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)}
            placeholder="Name (optional)" />
          <Button type="button" variant="secondary" onClick={addMember}>Add Member</Button>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          Create Group{members.length > 0 ? ` · ${members.length + 1} members` : ''}
        </Button>
      </form>
    </div>
  );
}
