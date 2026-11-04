import type {
  CatalogItem,
  HistoryEntry,
  Meta,
  Subscription,
  SubscriptionInput,
  Summary,
  SyncResult,
  User,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Sessions live in HttpOnly cookies set by the API — no token is ever stored in
 * JavaScript, so an XSS payload cannot read the session. State-changing requests
 * echo the readable CSRF cookie in a header (double-submit pattern).
 */
function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)sw_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken() } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });
  } catch {
    throw new ApiError('Cannot reach the SubWatch API. Is the server running?', 0);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? 'Request failed', res.status);
  }
  return data as T;
}

export const api = {
  meta: () => request<Meta>('/meta'),

  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  me: () => request<{ user: User }>('/auth/me'),

  session: () => request<{ user: User | null }>('/auth/session'),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  updateProfile: (patch: {
    name?: string;
    currency?: string;
    current_password?: string;
    new_password?: string;
  }) => request<{ user: User; password_changed?: boolean }>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }),

  deleteAccount: (password: string) =>
    request<{ ok: true }>('/account', { method: 'DELETE', body: JSON.stringify({ password }) }),

  subscriptions: () => request<{ subscriptions: Subscription[] }>('/subscriptions'),

  createSubscription: (input: SubscriptionInput) =>
    request<{ subscription: Subscription }>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateSubscription: (id: number, patch: Partial<SubscriptionInput>) =>
    request<{ subscription: Subscription; price_change_logged: boolean }>(`/subscriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteSubscription: (id: number) =>
    request<{ ok: true }>(`/subscriptions/${id}`, { method: 'DELETE' }),

  history: (id: number) =>
    request<{ subscription: Subscription; history: HistoryEntry[] }>(`/subscriptions/${id}/history`),

  summary: () => request<Summary>('/analytics/summary'),

  reminders: () =>
    request<{ count: number; due_in_next_7_days: number; total_amount: number }>('/reminders'),

  providerSync: () => request<SyncResult>('/provider-sync', { method: 'POST' }),

  catalog: (q = '') =>
    request<{ items: CatalogItem[] }>(`/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  seedDemo: () => request<{ ok: true }>('/demo/seed', { method: 'POST' }),

  clearData: () => request<{ ok: true }>('/account/data', { method: 'DELETE' }),

  exportUrl: () => '/api/export.csv',
};
