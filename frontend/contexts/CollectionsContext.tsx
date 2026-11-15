import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface Collection {
  id: string;
  name: string;
  gameIds: string[];
}

interface CollectionsContextValue {
  collections: Collection[];
  createCollection: (name: string, initialGameId?: string) => Collection;
  addGameToCollection: (collectionId: string, gameId: string) => void;
  removeGameFromCollection: (collectionId: string, gameId: string) => void;
}

const STORAGE_KEY = 'wps5_collections';

export const CollectionsContext = createContext<CollectionsContextValue>({
  collections: [],
  createCollection: () => ({ id: '', name: '', gameIds: [] }),
  addGameToCollection: () => { },
  removeGameFromCollection: () => { },
});

export function CollectionsProvider({ children }: { children: React.ReactNode }) {
  const [collections, setCollections] = useState<Collection[]>([]);

  // Load persisted collections on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setCollections(parsed);
          } catch {
            // ignore corrupt data
          }
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: Collection[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const createCollection = useCallback(
    (name: string, initialGameId?: string): Collection => {
      const newCollection: Collection = {
        id: `col_${Date.now()}`,
        name: name.trim() || 'Nueva colección',
        gameIds: initialGameId ? [initialGameId] : [],
      };
      setCollections((prev) => {
        const next = [...prev, newCollection];
        persist(next);
        return next;
      });
      return newCollection;
    },
    [persist]
  );

  const addGameToCollection = useCallback(
    (collectionId: string, gameId: string) => {
      setCollections((prev) => {
        const next = prev.map((c) => {
          if (c.id !== collectionId) return c;
          if (c.gameIds.includes(gameId)) return c;
          return { ...c, gameIds: [...c.gameIds, gameId] };
        });
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeGameFromCollection = useCallback(
    (collectionId: string, gameId: string) => {
      setCollections((prev) => {
        const next = prev.map((c) => {
          if (c.id !== collectionId) return c;
          return { ...c, gameIds: c.gameIds.filter((id) => id !== gameId) };
        });
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const value = useMemo(
    () => ({ collections, createCollection, addGameToCollection, removeGameFromCollection }),
    [collections, createCollection, addGameToCollection, removeGameFromCollection]
  );

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

export function useCollections() {
  return useContext(CollectionsContext);
}
