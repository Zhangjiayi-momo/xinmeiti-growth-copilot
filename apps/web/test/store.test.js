import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadDatabase, saveDatabase, syncDatabaseFromServer } from '../js/store.js';
import { createAppServer } from '../server.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
test('本地数据可以与版本化服务器同步', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xinmeiti-store-api-'));
  const server = createAppServer({ dataFile: path.join(directory, 'database.json') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });

  const storage = memoryStorage();
  const local = createDemoDatabase();
  const first = await syncDatabaseFromServer(local, storage, { baseUrl });
  assert.equal(first.state, 'synced');
  assert.equal(first.revision, 1);
  assert.ok(storage.getItem(STORAGE_KEY));

  const current = await fetch(`${baseUrl}/api/database`).then((response) => response.json());
  current.database.campaigns[0].name = '服务器更新后的战役';
  const pushed = await fetch(`${baseUrl}/api/database`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: current.revision, database: current.database })
  }).then((response) => response.json());
  assert.equal(pushed.revision, 2);

  const pulled = await syncDatabaseFromServer(first.database, storage, { baseUrl });
  assert.equal(pulled.source, 'server');
  assert.equal(pulled.database.campaigns[0].name, '服务器更新后的战役');
});