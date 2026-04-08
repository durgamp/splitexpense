'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { AuthGuard } from '@/components/AuthGuard';
import { groupsApi } from '@/services/api';
import { useGroupStore } from '@/store/group.store';

interface Member { phone: string; name: string; }

function CreateGroupContent() {
  const router = useRouter();
  const { upsertGroup } = useGroupStore();
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [phone, setPhone] = useState('');
  const [mName, setMName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function addMember() {
    const phoneRaw = phone.trim();
    const nameRaw = mName.trim();
    const errs: Record<string, string> = {};
    if (!phoneRaw) errs.phone = 'Enter phone number';
    else if (!/^\+[1-9]\d{6,14}$/.test(phoneRaw)) errs.phone = 'Use international format: +91XXXXXXXXXX';
    if (!nameRaw) errs.mName = 'Enter member name';
    if (members.some((m) => m.phone === phoneRaw)) errs.phone = 'Already added';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setMembers((prev) => [...prev, { phone: phoneRaw, name: nameRaw }]);
    setPhone(''); setMName('');
  }

  function removeMember(phone: string) {
    setMembers((prev) => prev.filter((m) => m.phone !== phone));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!groupName.trim()) errs.groupName = 'Enter a group name';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const { data } = await groupsApi.create(groupName.trim(), members);
      upsertGroup(data.group);
      router.push(`/group/${data.group.id}`);
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setErrors({ submit: typeof raw === 'string' ? raw : 'Failed to create group' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <h1 className="font-bold text-gray-900 flex-1">New Group</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-6 pb-24">
        <Input
          label="Group name"
          value={groupName}
          onChange={(e) => { setGroupName(e.target.value); setErrors((v) => ({ ...v, groupName: '' })); }}
          placeholder="e.g. Goa Trip, Flat mates"
          autoFocus
          error={errors.groupName}
        />

        {/* Members list */}
        {members.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-gray-600">Members ({members.length})</p>
            {members.map((m) => (
              <div key={m.phone} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm">
                <Avatar name={m.name} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.phone}</p>
                </div>
                <button type="button" onClick={() => removeMember(m.phone)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-xl leading-none">×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add member */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-700">Add members</p>
          <Input
            label="Phone"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrors((v) => ({ ...v, phone: '' })); }}
            placeholder="+91XXXXXXXXXX"
            type="tel"
            inputMode="tel"
            error={errors.phone}
          />
          <Input
            label="Name"
            value={mName}
            onChange={(e) => { setMName(e.target.value); setErrors((v) => ({ ...v, mName: '' })); }}
            placeholder="e.g. Rahul"
            error={errors.mName}
          />
          <Button type="button" variant="ghost" onClick={addMember}>+ Add member</Button>
        </div>

        {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}
        <Button type="submit" fullWidth size="lg" loading={loading}>Create Group</Button>
      </form>
    </div>
  );
}

export default function CreateGroupPage() {
  return (
    <AuthGuard>
      <CreateGroupContent />
    </AuthGuard>
  );
}
