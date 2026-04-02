import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { invitesApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { useGroupStore } from '@/store/group.store';

interface GroupPreview { id: string; name: string; memberCount: number; createdAt: number; }

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { status } = useAuthStore();
  const { upsertGroup } = useGroupStore();
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [state, setState] = useState<'loading' | 'preview' | 'joining' | 'joined' | 'invalid'>('loading');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    invitesApi.preview(token)
      .then(({ data }) => { setPreview(data.group); setState('preview'); })
      .catch(() => setState('invalid'));
  }, [token]);

  useEffect(() => {
    if (state === 'preview' && (status === 'unauthenticated' || status === 'needs-setup')) {
      navigate(`/login?invite=${token}`);
    }
  }, [state, status]);

  async function join() {
    if (!token) return;
    setState('joining');
    try {
      const { data } = await invitesApi.join(token);
      upsertGroup(data.group);
      setState('joined');
      setTimeout(() => navigate(`/group/${data.group.id}`), 800);
    } catch { setState('invalid'); }
  }

  if (state === 'loading') return <div className="min-h-screen flex items-center justify-center text-3xl text-gray-200">⏳</div>;

  if (state === 'invalid') return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="text-5xl">😕</span>
      <h2 className="text-xl font-bold text-gray-900">Invalid or expired link</h2>
      <Button onClick={() => navigate('/')}>Go Home</Button>
    </div>
  );

  if (state === 'joined') return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <span className="text-5xl">🎉</span>
      <h2 className="text-xl font-bold text-gray-900">Joined!</h2>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-center">
        {preview && <Avatar name={preview.name} size={80} />}
        <h2 className="text-2xl font-bold text-gray-900">{preview?.name}</h2>
        <p className="text-gray-400">{preview?.memberCount} members</p>
      </div>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <Button fullWidth size="lg" loading={state === 'joining'} onClick={join}>Join Group</Button>
        <Button fullWidth variant="ghost" onClick={() => navigate('/')}>Not now</Button>
      </div>
    </div>
  );
}
