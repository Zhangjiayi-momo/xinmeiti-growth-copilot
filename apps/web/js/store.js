import { normalizeDatabase } from '../../../packages/domain/src/models.js';
import { createDemoDatabase } from '../../../packages/domain/src/seed.js';

export const STORAGE_KEY = 'xinmeiti_growth_copilot_db_v2';
const LEGACY_STORAGE_KEY = 'xinmeiti_growth_copilot_db_v1';
const IDB_NAME = 'xinmeiti-growth-copilot';
const IDB_STORE = 'database';
const IDB_KEY = 'current';

let databasePromise;
let writeQueue = Promise.resolve();

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

function isLegacyPayload(payload) {
  return !payload || payload.version !== 2 || !Array.isArray(payload.snapshots);
}

export function loadDatabase(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY) || storage?.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      const demo = createDemoDatabase();
      saveDatabase(demo, storage);
      return demo;
    }
    const payload = JSON.parse(raw);
    const normalized = normalizeDatabase(payload);
    if (isLegacyPayload(payload)) {
      saveDatabase(normalized, storage);
    } else {
      storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    storage?.removeItem(LEGACY_STORAGE_KEY);
    return normalized;
  } catch (error) {
    console.warn('读取本地数据失败，已恢复演示数据。', error);
    const demo = createDemoDatabase();
    saveDatabase(demo, storage);
    return demo;
  }
}

export function saveDatabase(database, storage = globalThis.localStorage) {
  const normalized = normalizeDatabase({ ...database, updatedAt: new Date().toISOString() });
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  queueIndexedDatabaseWrite(normalized);
  return normalized;
}

export async function syncDatabaseFromIndexedDB(
  storage = globalThis.localStorage,
  factory = globalThis.indexedDB
) {
  const local = loadDatabase(storage);
  if (!factory) return { database: local, source: 'localStorage' };

  try {
    const stored = await readIndexedDatabase(factory);
    if (!stored) {
      await writeIndexedDatabase(local, factory);
      return { database: local, source: 'localStorage' };
    }

    const remote = normalizeDatabase(stored);
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