/**
 * Amigos online WPS5: búsqueda, solicitudes y lista.
 * Usa la sesión guardada de onlineAccountService.
 */
import { authedOnlineRequest, type OnlineUser } from './onlineAccountService';

export interface FriendRequestItem {
  id: string;
  createdAt: string;
  user: OnlineUser;
}

export interface FriendItem {
  friendshipId: string;
  user: OnlineUser;
  friendshipCreatedAt: string;
}

export interface UserProfileResult {
  user: OnlineUser;
  friendship: 'none' | 'pending' | 'accepted' | string;
  isSelf: boolean;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await authedOnlineRequest<T>(path, init);
  } catch (error: any) {
    if (error?.status) throw error;
    const err: any = new Error('network');
    err.status = 0;
    throw err;
  }
}

export async function searchOnlineUsers(query: string): Promise<OnlineUser[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const data = await call<{ users: OnlineUser[] }>(`/users/search?q=${encodeURIComponent(q)}`);
  return Array.isArray(data.users) ? data.users : [];
}

export async function fetchOnlineUserProfile(username: string): Promise<UserProfileResult> {
  const data = await call<UserProfileResult>(`/users/${encodeURIComponent(username.trim().toLowerCase())}`);
  return data;
}

export async function sendOnlineFriendRequest(userId: string): Promise<void> {
  await call('/friends/request', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function fetchOnlineFriendRequests(): Promise<FriendRequestItem[]> {
  const data = await call<{ requests: FriendRequestItem[] }>('/friends/requests');
  return Array.isArray(data.requests) ? data.requests : [];
}

export async function acceptOnlineFriendRequest(requestId: string): Promise<void> {
  await call('/friends/accept', {
    method: 'POST',
    body: JSON.stringify({ requestId }),
  });
}

export async function rejectOnlineFriendRequest(requestId: string): Promise<void> {
  await call('/friends/reject', {
    method: 'POST',
    body: JSON.stringify({ requestId }),
  });
}

export async function fetchOnlineFriends(): Promise<FriendItem[]> {
  const data = await call<{ friends: FriendItem[] }>('/friends');
  return Array.isArray(data.friends) ? data.friends : [];
}

export async function removeOnlineFriend(friendshipId: string): Promise<void> {
  await call(`/friends/${encodeURIComponent(friendshipId)}`, { method: 'DELETE' });
}
