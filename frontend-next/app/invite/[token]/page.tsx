'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { invitesApi } from '@/services/api';
import { useGroupStore } from '@/store/group.store';
import { useAuthStore } from '@/store/auth.store';
import type { Group } from '@/types';

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { status } = useAuthStore();
  const { upsertGroup } = useGroupStore();

  const [preview, setPreview] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!token) return;
    invitesApi.preview(token)
      .then(({ data }) => setPreview(data.group))
      .catch(() => setError('Invite link is invalid or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleJoin() {
    if (status !== 'authenticated') {
      router.push(`/login?invite=${token}`);
      return;
    }
    setJoining(true);
    try {
      const { data } = await invitesApi.join(token!);
      if (data.group) upsertGroup(data.group);
      setJoined(true);
      setTimeout(() => router.push(`/group/${data.group?.id ?? ''}`), 1200);
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setError(typeof raw === 'string' ? raw : 'Failed to join group. Try again.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-indigo-600">SplitEase</h1>

        {loading ? (
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : error ? (
          <div className="flex flex-col items-center gap-4">
            <span className="text-5xl">🔗</span>
            <p className="text-gray-700 font-medium">{error}</p>
            <Button onClick={() => router.push('/login')}>Go to Sign in</Button>
          </div>
        ) : joined ? (
          <div className="flex flex-col items-center gap-4">
            <span className="text-5xl">🎉</span>
            <p className="text-gray-700 font-medium">You&apos;ve joined <strong>{preview?.name}</strong>!</p>
            <p className="text-sm text-gray-400">Redirecting…</p>
          </div>
        ) : preview ? (
          <div className="flex flex-col items-center gap-5 w-full">
            <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-3xl font-bold text-indigo-600">
              {preview.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm text-gray-500">You&apos;re invited to join</p>
              <h2 className="text-2xl font-bold text-gray-900 mt-1">{preview.name}</h2>
              <p className="text-sm text-gray-400 mt-1">
                {preview.members.filter((m) => m.status === 'active').length} members
              </p>
            </div>
            <Button fullWidth size="lg" loading={joining} onClick={handleJoin}>
              {status === 'authenticated' ? 'Join Group' : 'Sign in to Join'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
