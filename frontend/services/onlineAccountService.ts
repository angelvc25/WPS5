/**
 * Cliente de cuentas online WPS5 (Cloudflare Worker + D1).
 * Auth con Bearer token, sesiones de 30 días persistidas en localStorage.
 */

const API_BASE =
  (typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_WPS5_API_URL) ||
  'https://wps5-api.wps5-api.workers.dev';

export function getOnlineApiBase(): string {
  return API_BASE;
}

const SESSION_KEY = 'wps5_online_session_v1';
const REQUEST_TIMEOUT_MS = 15000;

export interface OnlineUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  libraryVisibility: string;
  createdAt: string | null;
  lastSeenAt: string | null;
}

export interface OnlineSession {
  token: string;
  user: OnlineUser;
  expiresAt: number;
}

export interface AuthResult {
  ok: boolean;
  session?: OnlineSession;
  /** Mensaje de error del servidor (inglés) o 'network'. */
  error?: string;
  status?: number;
}

type SessionListener = (session: OnlineSession | null) => void;

const listeners = new Set<SessionListener>();
let memorySession: OnlineSession | null | undefined;

function readStoredSession(): OnlineSession | null {
  if (memorySession !== undefined) return memorySession;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;
    if (!raw) {
      memorySession = null;
      return null;
    }
    const parsed = JSON.parse(raw) as OnlineSession;
    if (!parsed?.token || !parsed?.user) {
      memorySession = null;
      return null;
    }
    memorySession = parsed;
    return parsed;
  } catch {
    memorySession = null;
    return null;
  }
}

function writeStoredSession(session: OnlineSession | null) {
  memorySession = session;
  try {
    if (typeof localStorage === 'undefined') return;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
  listeners.forEach((fn) => {
    try {
      fn(session);
    } catch {
      /* noop */
    }
  });
}

export function subscribeOnlineSession(fn: SessionListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getOnlineSession(): OnlineSession | null {
  const session = readStoredSession();
  if (session && session.expiresAt && Date.now() > session.expiresAt) {
    writeStoredSession(null);
    return null;
  }
  return session;
}

async function request<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const json = (await response.json().catch(() => null)) as any;
    if (!response.ok || !json || json.success !== true) {
      const err: any = new Error(typeof json?.error === 'string' ? json.error : `HTTP ${response.status}`);
      err.status = response.status;
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        const secs = Number(retryAfter);
        if (Number.isFinite(secs) && secs > 0) err.retryAfterMs = Math.min(secs, 120) * 1000;
      }
      throw err;
    }
    return json as T;
  } catch (error: any) {
    if (error?.status) throw error;
    const err: any = new Error('network');
    err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function toSession(data: { user: OnlineUser; token: string; expiresIn?: number }): OnlineSession {
  const ttlMs = typeof data.expiresIn === 'number' ? data.expiresIn * 1000 : 30 * 24 * 60 * 60 * 1000;
  return { token: data.token, user: data.user, expiresAt: Date.now() + ttlMs };
}

export function validateUsername(value: string): string | null {
  const v = (value || '').trim().toLowerCase();
  if (v.length < 3 || v.length > 24) return 'length';
  if (!/^[a-z0-9_]+$/.test(v)) return 'charset';
  return null;
}

export function validatePassword(value: string): string | null {
  const v = value || '';
  if (v.length < 8 || v.length > 128) return 'length';
  return null;
}

export async function registerOnlineAccount(
  username: string,
  password: string,
  displayName?: string,
): Promise<AuthResult> {
  const usernameError = validateUsername(username);
  if (usernameError) return { ok: false, error: usernameError === 'length' ? 'Username length' : 'Username charset' };
  const passwordError = validatePassword(password);
  if (passwordError) return { ok: false, error: 'Password length' };
  try {
    const data = await request<{ user: OnlineUser; token: string; expiresIn: number }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        password,
        ...(displayName?.trim() ? { displayName: displayName.trim().slice(0, 50) } : {}),
      }),
    });
    const session = toSession(data);
    writeStoredSession(session);
    return { ok: true, session };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'network', status: error?.status };
  }
}

export async function loginOnlineAccount(username: string, password: string): Promise<AuthResult> {
  if (!username.trim() || !password) return { ok: false, error: 'Missing credentials' };
  try {
    const data = await request<{ user: OnlineUser; token: string; expiresIn: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
    });
    const session = toSession(data);
    writeStoredSession(session);
    return { ok: true, session };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'network', status: error?.status };
  }
}

export async function logoutOnlineAccount(): Promise<void> {
  const session = readStoredSession();
  if (session) {
    try {
      await request('/auth/logout', { method: 'POST' }, session.token);
    } catch {
      /* aunque falle en red, se cierra local */
    }
  }
  writeStoredSession(null);
}

export async function fetchOnlineMe(token?: string): Promise<OnlineUser | null> {
  const activeToken = token || readStoredSession()?.token;
  if (!activeToken) return null;
  try {
    const data = await request<{ user: OnlineUser }>('/auth/me', { method: 'GET' }, activeToken);
    const current = readStoredSession();
    if (current && current.token === activeToken) {
      writeStoredSession({ ...current, user: data.user });
    }
    return data.user;
  } catch {
    return null;
  }
}

/** Llamada autenticada con el token guardado. Lanza Error con .status. */
export async function authedOnlineRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getOnlineSession();
  if (!session) {
    const err: any = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  return request<T>(path, init, session.token);
}
/** Valida el token guardado contra /auth/me. Limpia la sesión si es inválida. */
export async function restoreOnlineSession(): Promise<OnlineSession | null> {
  const session = getOnlineSession();
  if (!session) return null;
  const user = await fetchOnlineMe(session.token);
  if (!user) {
    writeStoredSession(null);
    return null;
  }
  return readStoredSession();
}

export interface OnlineProfileUpdate {
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  libraryVisibility?: 'public' | 'friends' | 'private';
}

/** PATCH /users/me — actualiza el perfil y refresca el usuario en sesión. */
export async function updateOnlineProfile(input: OnlineProfileUpdate): Promise<OnlineUser> {
  const data = await authedOnlineRequest<{ user: OnlineUser }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  const current = readStoredSession();
  if (current) writeStoredSession({ ...current, user: data.user });
  return data.user;
}

function httpMediaUrl(value: unknown): string | null {
  const raw = typeof value === 'string' ? value : (value as any)?.uri;
  return typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw : null;
}

export interface LocalProfileMedia {
  avatar?: unknown;
  avatarBase64?: unknown;
  steamAvatarUrl?: unknown;
  useSteamAvatar?: boolean;
  coverImage?: unknown;
}

/**
 * Sube avatar/portada del perfil local a la cuenta online (solo URLs http,
 * que son las únicas visibles para otros dispositivos). No toca base64 ni
 * rutas locales. Devuelve true si quedó sincronizado o no había nada que subir.
 */
export async function syncProfileMediaToOnline(local: LocalProfileMedia): Promise<boolean> {
  const session = getOnlineSession();
  if (!session) return false;
  const avatar = httpMediaUrl(local.avatar)
    || (local.useSteamAvatar ? httpMediaUrl(local.steamAvatarUrl) : null);
  const cover = httpMediaUrl(local.coverImage);
  const input: OnlineProfileUpdate = {};
  if (avatar && avatar !== session.user.avatarUrl) input.avatarUrl = avatar;
  if (cover && cover !== session.user.coverUrl) input.coverUrl = cover;
  if (Object.keys(input).length === 0) return true;
  try {
    await updateOnlineProfile(input);
    return true;
  } catch {
    return false;
  }
}
