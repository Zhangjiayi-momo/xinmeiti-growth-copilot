import { normalizeDatabase } from '../../../packages/domain/src/models.js';
import { createDemoDatabase } from '../../../packages/domain/src/seed.js';

export const STORAGE_KEY = 'xinmeiti_growth_copilot_db_v2';
const LEGACY_STORAGE_KEY = 'xinmeiti_growth_copilot_db_v1';
const SYNC_TOKEN_KEY = 'xinmeiti_growth_copilot_sync_token';
const IDB_NAME = 'xinmeiti-growth-copilot';
const IDB_STORE = 'database';
const IDB_KEY = 'current';

let databasePromise;
let writeQueue = Promise.resolve();
let serverWriteQueue = Promise.resolve();
let serverRevision = 0;
let serverState = 'offline';
let lastConflict = null;
let lastSyncError = '';

function openIndexedDatabase(factory = globalThis.indexedDB) {
  if (!factory) return Promise.resolve(null);
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = factory.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IDB_STORE)) request.result.createObjectStore(IDB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
    });
  }
  return databasePromise;
}

async function readIndexedDatabase(factory = globalThis.indexedDB) {
  const database = await openIndexedDatabase(factory);
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IDB_STORE, 'readonly');
    const request = transaction.objectStore(IDB_STORE).get(IDB_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('IndexedDB 读取失败'));
  });
}

async function writeIndexedDatabase(database, factory = globalThis.indexedDB) {
  const connection = await openIndexedDatabase(factory);
  if (!connection) return false;
  return new Promise((resolve, reject) => {
    const transaction = connection.transaction(IDB_STORE, 'readwrite');
    transaction.objectStore(IDB_STORE).put(database, IDB_KEY);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 写入失败'));
  });
}

function queueIndexedDatabaseWrite(database, factory = globalThis.indexedDB) {
  if (!factory) return;
  writeQueue = writeQueue
    .then(() => writeIndexedDatabase(database, factory))
    .catch((error) => console.warn('IndexedDB 写入失败，已保留 localStorage 数据。', error));
}

function persistLocally(database, storage, touchUpdatedAt = true) {
  const normalized = normalizeDatabase(touchUpdatedAt
    ? { ...database, updatedAt: new Date().toISOString() }
    : database);
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  queueIndexedDatabaseWrite(normalized);
  return normalized;
}

function isLegacyPayload(payload) {
  return !payload || payload.version !== 2 || !Array.isArray(payload.snapshots);
}

function apiBaseUrl() {
  return globalThis.location?.protocol?.startsWith('http') ? globalThis.location.origin : '';
}

export function getSyncToken(storage = globalThis.localStorage) {
  return storage?.getItem(SYNC_TOKEN_KEY) || '';
}

export function setSyncToken(token, storage = globalThis.localStorage) {
  const value = String(token || '').trim();
  if (value) storage?.setItem(SYNC_TOKEN_KEY, value);
  else storage?.removeItem(SYNC_TOKEN_KEY);
  return value;
}

export function getServerSyncState() {
  return { revision: serverRevision, state: serverState, conflict: lastConflict, error: lastSyncError };
}

async function apiRequest(pathname, options = {}) {
  const baseUrl = options.baseUrl ?? apiBaseUrl();
  if (!baseUrl) throw new Error('当前运行环境不支持服务器同步');
  const token = options.token ?? getSyncToken(options.storage);
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409) return { conflict: true, ...payload };
  if (!response.ok) throw new Error(payload.error || `服务器请求失败：${response.status}`);
  return payload;
}

export async function pushDatabaseToServer(database, options = {}) {
  try {
    const result = await apiRequest('/api/database', {
      method: 'PUT',
      baseUrl: options.baseUrl,
      token: options.token,
      storage: options.storage,
      body: { baseRevision: options.baseRevision ?? serverRevision, database }
    });
    if (result.conflict) {
      serverRevision = result.revision;
      serverState = 'conflict';
      lastConflict = result;
      return result;
    }
    serverRevision = result.revision;
    serverState = 'synced';
    lastConflict = null;
    return result;
  } catch (error) {
    serverState = 'offline';
    throw error;
  }
}

function queueServerDatabaseWrite(database) {
  if (!apiBaseUrl()) return;
  serverWriteQueue = serverWriteQueue
    .then(() => pushDatabaseToServer(database))
    .catch((error) => console.warn('服务器同步失败，本地数据已保留。', error));
}

export function loadDatabase(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY) || storage?.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      const demo = createDemoDatabase();
      persistLocally(demo, storage);
      return demo;
    }
    const payload = JSON.parse(raw);
    const normalized = normalizeDatabase(payload);
    if (isLegacyPayload(payload)) {
      persistLocally(normalized, storage, false);
    } else {
      storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    storage?.removeItem(LEGACY_STORAGE_KEY);
    return normalized;
  } catch (error) {
    console.warn('读取本地数据失败，已恢复演示数据。', error);
    const demo = createDemoDatabase();
    persistLocally(demo, storage);
    return demo;
  }
}

export function saveDatabase(database, storage = globalThis.localStorage) {
  const normalized = persistLocally(database, storage);
  queueServerDatabaseWrite(normalized);
  return normalized;
}

export async function syncDatabaseFromIndexedDB(
  storage = globalThis.localStorage,
  factory = globalThis.indexedDB
) {
  const local = loadDatabase(storage);
  if (!factory) return { database: local, source: 'localStorage' };

  try {
    const result = await Promise.race([
      readIndexedDatabase(factory).then((value) => ({ value })),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 1500))
    ]);
    if (result.timeout) {
      return { database: local, source: 'localStorage' };
    }
    const stored = result.value;
    if (!stored) {
      await writeIndexedDatabase(local, factory);
      return { database: local, source: 'localStorage' };
    }    const remote = normalizeDatabase(stored);
    const localTime = Date.parse(local.updatedAt) || 0;
    const remoteTime = Date.parse(remote.updatedAt) || 0;
    if (remoteTime > localTime) {
      storage?.setItem(STORAGE_KEY, JSON.stringify(remote));
      return { database: remote, source: 'indexedDB' };
    }
    await writeIndexedDatabase(local, factory);
    return { database: local, source: 'localStorage' };
  } catch (error) {
    console.warn('IndexedDB 同步失败，继续使用 localStorage。', error);
    return { database: local, source: 'localStorage' };
  }
}

export async function syncDatabaseFromServer(
  localDatabase = loadDatabase(),
  storage = globalThis.localStorage,
  options = {}
) {
  persistLocally(localDatabase, storage, false);
  if (!(options.baseUrl || apiBaseUrl())) {
    serverState = 'offline';
    return { database: localDatabase, source: 'localStorage', revision: 0, state: serverState };
  }

  try {
    const envelope = await apiRequest('/api/database', {
      baseUrl: options.baseUrl,
      token: options.token,
      storage
    });
    serverRevision = envelope.revision || 0;
    lastConflict = null;

    if (!envelope.database || serverRevision === 0) {
      const pushed = await pushDatabaseToServer(localDatabase, {
        baseUrl: options.baseUrl,
        token: options.token,
        storage,
        baseRevision: 0
      });
      serverState = pushed.conflict ? 'conflict' : 'synced';
      return { database: localDatabase, source: 'localStorage', revision: serverRevision, state: serverState };
    }

    const localTime = Date.parse(localDatabase.updatedAt) || 0;
    const serverTime = Date.parse(envelope.updatedAt) || 0;
    if (serverTime > localTime) {
      const database = persistLocally(envelope.database, storage, false);
      serverState = 'synced';
      return { database, source: 'server', revision: serverRevision, state: serverState };
    }

    const pushed = await pushDatabaseToServer(localDatabase, {
      baseUrl: options.baseUrl,
      token: options.token,
      storage,
      baseRevision: serverRevision
    });
    if (pushed.conflict) {
      const database = persistLocally(pushed.database || localDatabase, storage, false);
      return { database, source: 'server', revision: serverRevision, state: 'conflict', conflict: pushed };
    }
    serverState = 'synced';
    return { database: localDatabase, source: 'localStorage', revision: serverRevision, state: serverState };
  } catch (error) {
    serverState = 'offline';
    console.warn('服务器同步不可用，继续使用本地数据。', error);
    return { database: localDatabase, source: 'localStorage', revision: 0, state: serverState };
  }
}

export function resetDatabase(storage = globalThis.localStorage) {
  const demo = createDemoDatabase();
  saveDatabase(demo, storage);
  return demo;
}

export function clearDatabase(storage = globalThis.localStorage) {
  storage?.removeItem(STORAGE_KEY);
  storage?.removeItem(LEGACY_STORAGE_KEY);
  const factory = globalThis.indexedDB;
  if (factory) {
    openIndexedDatabase(factory)
      .then((database) => database && database.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).clear())
      .catch((error) => console.warn('IndexedDB 清理失败。', error));
  }
}