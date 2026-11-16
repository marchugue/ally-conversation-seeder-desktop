export const DEFAULT_BACKEND_URL = 'https://api.ally-jis.com';
export const LOCAL_BACKEND_URL = 'http://localhost:3001';

export interface SeederMember {
  id: string;
  userId: string;
  username: string | null;
  fullName: string | null;
  anonymousHandle: string | null;
  avatarUrl: string | null;
}

export interface SeederMatch {
  id: string;
  userAId?: string | null;
  userBId?: string | null;
  userAAlias?: string | null;
  userBAlias?: string | null;
  matchPoints: number;
  stagePoints: number;
  currentStage: number;
  dayStreak: number;
  revealedAt: string | null;
  status: string;
}

export interface SeederConversation {
  id: string;
  type: string;
  title: string;
  dayStreak?: number;
  members: SeederMember[];
  userA?: SeederMember | null;
  userB?: SeederMember | null;
  match: SeederMatch | null;
}

export interface AdminSession {
  token: string;
  email: string;
  role: string;
}

export interface SeedResult {
  success: boolean;
  message: string;
  points: number;
  stage: number;
  dayStreak: number;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      request: (payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<{ ok: boolean; status: number; data: any }>;
    };
  }
}

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

async function apiFetch<T = any>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const cleanBase = normalizeBaseUrl(baseUrl);
  const url = `${cleanBase}/api${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  if (window.electronAPI?.request) {
    const res = await window.electronAPI.request({
      url,
      method: options.method ?? 'GET',
      headers,
      body,
    });
    if (!res.ok) {
      const err = new Error(res.data?.message || res.data?.error || `Request failed (${res.status})`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.data as T;
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text || res.statusText };
  }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function loginAdminOnly(
  baseUrl: string,
  email: string,
  password: string,
): Promise<AdminSession> {
  const authRes = await apiFetch<{
    accessToken?: string;
    access_token?: string;
    user?: { email?: string; role?: string };
  }>(baseUrl, '/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  });

  const token = authRes.accessToken || authRes.access_token;
  if (!token) {
    throw new Error('Authentication succeeded without an access token');
  }

  const adminCheck = await verifyAdminSession(baseUrl, token);
  return {
    token,
    email: authRes.user?.email || email.trim(),
    role: adminCheck.role,
  };
}

export async function verifyAdminSession(
  baseUrl: string,
  token: string,
): Promise<{ role: string }> {
  const me = await apiFetch<{ role?: string | null }>(baseUrl, '/admin/me', {
    method: 'GET',
    token,
  });
  if (!me?.role) {
    throw new Error('Access denied: Admin account required.');
  }
  return { role: me.role };
}

export async function fetchSeederConversations(
  baseUrl: string,
  token: string,
  limit = 100,
): Promise<SeederConversation[]> {
  const res = await apiFetch<{ conversations?: SeederConversation[] }>(
    baseUrl,
    `/admin/seeder/conversations?limit=${limit}`,
    { method: 'GET', token },
  );
  return res.conversations ?? [];
}

export async function seedConversationData(
  baseUrl: string,
  token: string,
  payload: { conversationId: string; points: number; dayStreak: number },
): Promise<SeedResult> {
  return apiFetch<SeedResult>(baseUrl, '/admin/seeder/points', {
    method: 'POST',
    token,
    body: payload,
  });
}

