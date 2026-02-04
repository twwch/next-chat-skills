import type { StorageProvider } from './storage';

let _storage: StorageProvider | null = null;
let _initPromise: Promise<StorageProvider> | null = null;

export async function getStorage(): Promise<StorageProvider> {
  if (_storage) return _storage;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const storageType = (process.env.STORAGE_TYPE || 'sqlite').toLowerCase();

    if (storageType === 'postgresql' || storageType === 'postgres') {
      const { createPgStorage } = await import('./pg-storage');
      _storage = await createPgStorage();
    } else {
      const { createSqliteStorage } = await import('./sqlite-storage');
      _storage = await createSqliteStorage();
    }

    return _storage!;
  })();

  try {
    return await _initPromise;
  } finally {
    _initPromise = null;
  }
}
