import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeDatabase } from '../../packages/domain/src/models.js';

function emptyEnvelope() {
  return { revision: 0, updatedAt: null, database: null };
}

export function createServerStore({ filePath }) {
  let envelope = emptyEnvelope();
  let loaded = false;
  let queue = Promise.resolve();

  async function load() {
    if (loaded) return envelope;
    try {
      const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
      envelope = {
        revision: Number(payload.revision) || 0,
        updatedAt: payload.updatedAt || null,
        database: payload.database ? normalizeDatabase(payload.database) : null
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      envelope = emptyEnvelope();
    }
    loaded = true;
    return envelope;
  }

  async function persist() {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(envelope, null, 2), 'utf8');
    await fs.rename(temporary, filePath);
  }

  function serialize(operation) {
    const next = queue.then(operation, operation);
    queue = next.catch(() => {});
    return next;
  }

  return {
    get() {
      return serialize(async () => {
        await load();
        return structuredClone(envelope);
      });
    },
    replace(database, baseRevision) {
      return serialize(async () => {
        await load();
        if (Number(baseRevision) !== envelope.revision) {
          return { conflict: true, ...structuredClone(envelope) };
        }
        const normalized = normalizeDatabase({ ...database, updatedAt: new Date().toISOString() });
        envelope = {
          revision: envelope.revision + 1,
          updatedAt: normalized.updatedAt,
          database: normalized
        };
        await persist();
        return { conflict: false, ...structuredClone(envelope) };
      });
    },
    reset() {
      return serialize(async () => {
        envelope = emptyEnvelope();
        await persist();
        return structuredClone(envelope);
      });
    }
  };
}