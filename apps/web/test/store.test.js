import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadDatabase, saveDatabase } from '../js/store.js';
import { createDemoDatabase } from '../../../packages/domain/src/seed.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); },
    dump() { return Object.fromEntries(data); }
  };
}

test('旧版 v1 数据会迁移到 v2 并生成快照', () => {
  const legacy = createDemoDatabase();
  legacy.version = 1;
  delete legacy.snapshots;
  const storage = memoryStorage({ xinmeiti_growth_copilot_db_v1: JSON.stringify(legacy) });
  const migrated = loadDatabase(storage);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.snapshots.length, migrated.records.length);
  assert.ok(storage.getItem(STORAGE_KEY));
  assert.equal(storage.getItem('xinmeiti_growth_copilot_db_v1'), null);
});

test('保存数据库后会写入 v2 存储键', () => {
  const storage = memoryStorage();
  saveDatabase(createDemoDatabase(), storage);
  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(saved.version, 2);
  assert.ok(saved.snapshots.length > 0);
});