import { create } from 'zustand';
import type { Group } from '@/types';

interface GroupState {
  groups: Group[];
  loading: boolean;
  error: string | null;

  setGroups: (groups: Group[]) => void;
  upsertGroup: (group: Group) => void;
  removeGroup: (id: string) => void;
  getById: (id: string) => Group | undefined;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  loading: false,
  error: null,

  setGroups: (groups) => set({ groups }),

  upsertGroup: (group) =>
    set((s) => {
      const idx = s.groups.findIndex((g) => g.id === group.id);
      if (idx >= 0) {
        const updated = [...s.groups];
        updated[idx] = group;
        return { groups: updated };
      }
      return { groups: [group, ...s.groups] };
    }),

  removeGroup: (id) =>
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),

  getById: (id) => get().groups.find((g) => g.id === id),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
