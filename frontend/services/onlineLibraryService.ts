/**
 * Biblioteca online WPS5: catálogo propio y de otros usuarios
 * (según visibilidad public/friends/private).
 */
import { authedOnlineRequest } from './onlineAccountService';

export interface OnlineLibraryGame {
  id: string;
  game_id: string;
  game_name: string;
  cover_url: string | null;
  metadata_json: string | null;
  added_at: string;
}

export interface OnlineLibraryResult {
  visible: boolean;
  reason?: string;
  userId?: string;
  username?: string;
  library: OnlineLibraryGame[];
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

export async function fetchOwnOnlineLibrary(): Promise<OnlineLibraryGame[]> {
  const data = await call<OnlineLibraryResult>('/library');
  return Array.isArray(data.library) ? data.library : [];
}

export async function addOnlineLibraryGame(input: {
  gameId: string;
  gameName: string;
  coverUrl?: string;
  metadata?: unknown;
}): Promise<OnlineLibraryGame | null> {
  const data = await call<{ game: OnlineLibraryGame }>('/library', {
    method: 'POST',
    body: JSON.stringify({
      gameId: input.gameId,
      gameName: input.gameName,
      ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    }),
  });
  return data.game || null;
}

export async function removeOnlineLibraryGame(gameId: string): Promise<void> {
  await call('/library', {
    method: 'DELETE',
    body: JSON.stringify({ gameId }),
  });
}

export async function fetchOnlineUserLibrary(userId: string): Promise<OnlineLibraryResult> {
  const data = await call<OnlineLibraryResult>(`/library/${encodeURIComponent(userId)}`);
  return data;
}
