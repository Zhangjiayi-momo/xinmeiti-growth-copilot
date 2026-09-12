import { normalizeDatabase } from '../../../packages/domain/src/models.js';
import { createDemoDatabase } from '../../../packages/domain/src/seed.js';

export const STORAGE_KEY = 'xinmeiti_growth_copilot_db_v1';

export function loadDatabase(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) {
      const demo = createDemoDatabase();
      saveDatabase(demo, storage);
      return demo;
    }
    return normalizeDatabase(JSON.parse(raw));
  } catch (error) {
    console.warn('读取本地数据失败，已恢复演示数据。', error);
    const demo = createDemoDatabase();
    saveDatabase(demo, storage);
    return demo;
  }
}

export function saveDatabase(database, storage = globalThis.localStorage) {
  const normalized = normalizeDatabase(database);
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetDatabase(storage = globalThis.localStorage) {
  const demo = createDemoDatabase();
  saveDatabase(demo, storage);
  return demo;
}

export function clearDatabase(storage = globalThis.localStorage) {
  storage?.removeItem(STORAGE_KEY);
}