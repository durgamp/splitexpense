import axios from 'axios';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach access token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: transparent token refresh ───────────────────────────
let isRefreshing = false;
// Each queued item resolves or rejects the waiting request
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function drainQueue(token: string) {
  refreshQueue.forEach(({ resolve }) => resolve(token));
  refreshQueue = [];
}

function rejectQueue(err: unknown) {
  refreshQueue.forEach(({ reject }) => reject(err));
  refreshQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      // Don't try to refresh if the failing request IS the refresh call — prevents loops.
      if (original.url?.includes('/auth/refresh')) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until the in-flight refresh finishes
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (newToken) => {
              original.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(original));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      try {
        // Use the same `api` instance so timeout/baseURL config is consistent
        const { data } = await api.post('/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefresh } = data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefresh);

        drainQueue(accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshError) {
        rejectQueue(refreshError);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  requestOtp: (email: string) => api.post('/auth/request-otp', { email }),
  verifyOtp: (email: string, code: string) => api.post('/auth/verify-otp', { email, code }),
  /** Called once after first login to save the mandatory phone number. Returns fresh tokens. */
  setup: (phone: string) => api.patch('/auth/setup', { phone }),
  /** Update display name from Profile screen (after setup is complete). */
  setName: (name: string) => api.patch('/auth/name', { name }),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) => api.delete('/auth/logout', { data: { refreshToken } }),
};

// ── Groups ────────────────────────────────────────────────────────────────────
export const groupsApi = {
  list: () => api.get('/groups'),
  create: (name: string, members: { phone: string; name: string }[]) =>
    api.post('/groups', { name, members }),
  get: (id: string) => api.get(`/groups/${id}`),
  rename: (id: string, name: string) => api.patch(`/groups/${id}`, { name }),
  delete: (id: string) => api.delete(`/groups/${id}`),
  addMember: (id: string, phone: string, name: string) =>
    api.post(`/groups/${id}/members`, { phone, name }),
};

// ── Expenses ──────────────────────────────────────────────────────────────────
export interface CustomSplitPayload { phone: string; value: number; }

export interface ExpensePayload {
  description: string;
  amountRupees: number;
  paidByPhone: string;
  participantPhones: string[];
  category: string;
  splitType?: 'equal' | 'exact' | 'percentage' | 'shares';
  splits?: CustomSplitPayload[];
  notes?: string;
}

export const expensesApi = {
  list: (groupId: string) => api.get(`/groups/${groupId}/expenses`),
  create: (groupId: string, data: ExpensePayload) =>
    api.post(`/groups/${groupId}/expenses`, data),
  update: (groupId: string, expenseId: string, data: Partial<ExpensePayload>) =>
    api.put(`/groups/${groupId}/expenses/${expenseId}`, data),
  delete: (groupId: string, expenseId: string) =>
    api.delete(`/groups/${groupId}/expenses/${expenseId}`),
};

// ── Payments ──────────────────────────────────────────────────────────────────
export interface PaymentPayload {
  fromPhone: string;
  toPhone: string;
  amountRupees: number;
  notes?: string;
}

export const paymentsApi = {
  list: (groupId: string) => api.get(`/groups/${groupId}/payments`),
  create: (groupId: string, data: PaymentPayload) =>
    api.post(`/groups/${groupId}/payments`, data),
  delete: (groupId: string, paymentId: string) =>
    api.delete(`/groups/${groupId}/payments/${paymentId}`),
};

// ── Friends ───────────────────────────────────────────────────────────────────
export const friendsApi = {
  list: () => api.get('/friends'),
  add: (phone: string, name: string) => api.post('/friends', { phone, name }),
};

// ── Invites ───────────────────────────────────────────────────────────────────
export const invitesApi = {
  preview: (token: string) => api.get(`/invite/${token}`),
  join: (token: string) => api.post(`/invite/${token}/join`),
  rotate: (groupId: string) => api.post(`/invite/groups/${groupId}/rotate`),
};

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
  get: () => api.get('/analytics'),
};

// ── Contacts ──────────────────────────────────────────────────────────────────
export const contactsApi = {
  match: (hashes: string[]) => api.post('/contacts/match', { hashes }),
  register: (hash: string) => api.post('/contacts/register', { hash }),
};
