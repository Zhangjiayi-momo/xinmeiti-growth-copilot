import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server.mjs';
import { createDemoDatabase } from '../../../packages/domain/src/seed.js';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('数据 API 支持读取、版本递增和冲突保护', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xinmeiti-api-'));
  const dataFile = path.join(directory, 'database.json');
  const server = createAppServer({ dataFile });
  const baseUrl = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.revision, 0);

  const database = createDemoDatabase();
  const created = await fetch(`${baseUrl}/api/database`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: 0, database })
  }).then((response) => response.json());
  assert.equal(created.revision, 1);
  assert.equal(created.database.records.length, database.records.length);

  const stale = await fetch(`${baseUrl}/api/database`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: 0, database })
  });
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.revision, 1);
  assert.equal(conflict.error, 'Revision conflict');
});

test('数据 API 可以校验同步令牌', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xinmeiti-api-auth-'));
  const server = createAppServer({ dataFile: path.join(directory, 'database.json'), token: 'test-token' });
  const baseUrl = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });

  const unauthorized = await fetch(`${baseUrl}/api/health`);
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(`${baseUrl}/api/health`, { headers: { Authorization: 'Bearer test-token' } });
  assert.equal(authorized.status, 200);
});