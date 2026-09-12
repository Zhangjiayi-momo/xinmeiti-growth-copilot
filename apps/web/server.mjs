import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServerStore } from './server-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, '../..');
const defaultDataFile = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(defaultRoot, 'data', 'database.json');
const defaultPort = Number(process.env.PORT || 4173);
const defaultHost = process.env.HOST || '127.0.0.1';
const defaultToken = process.env.SYNC_TOKEN || '';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req, limit = 10 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('请求数据超过 10MB'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safePath(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.resolve(root, `.${decoded}`);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function authorized(req, token) {
  if (!token) return true;
  return req.headers.authorization === `Bearer ${token}`;
}

export function createAppServer(options = {}) {
  const root = options.root || defaultRoot;
  const token = options.token ?? defaultToken;
  const store = options.store || createServerStore({ filePath: options.dataFile || defaultDataFile });

  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (requestUrl.pathname.startsWith('/api/')) {
        if (!authorized(req, token)) return sendJson(res, 401, { error: 'Unauthorized' });

        if (requestUrl.pathname === '/api/health' && req.method === 'GET') {
          const envelope = await store.get();
          return sendJson(res, 200, {
            ok: true,
            revision: envelope.revision,
            updatedAt: envelope.updatedAt,
            writable: true
          });
        }

        if (requestUrl.pathname === '/api/database' && req.method === 'GET') {
          return sendJson(res, 200, await store.get());
        }

        if (requestUrl.pathname === '/api/database' && req.method === 'PUT') {
          const body = await readJsonBody(req);
          const result = await store.replace(body.database, body.baseRevision);
          if (result.conflict) {
            return sendJson(res, 409, {
              error: 'Revision conflict',
              revision: result.revision,
              updatedAt: result.updatedAt,
              database: result.database
            });
          }
          return sendJson(res, 200, result);
        }

        return sendJson(res, 404, { error: 'API route not found' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendJson(res, 405, { error: 'Method not allowed' });
      }

      if (requestUrl.pathname === '/') {
        res.writeHead(302, { Location: '/apps/web/' });
        res.end();
        return;
      }

      let target = safePath(root, requestUrl.pathname);
      if (!target) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const stat = await fs.promises.stat(target).catch(() => null);
      if (!stat) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      if (stat.isDirectory()) target = path.join(target, 'index.html');
      const body = await fs.promises.readFile(target);
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    } catch (error) {
      const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
      sendJson(res, status, { error: status === 500 ? 'Internal server error' : error.message });
    }
  });
}

export function startServer(options = {}) {
  const server = createAppServer(options);
  const port = options.port ?? defaultPort;
  const host = options.host || defaultHost;
  server.listen(port, host, () => {
    console.log(`新媒体增长作战台已启动：http://${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  startServer();
}