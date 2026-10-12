// 로컬 개발 서버: 정적 파일 + /api/* 를 Vercel과 같은 파일 구조로 실행합니다.
// 사용: node scripts/dev-server.mjs  (PORT 기본 3000, 저장소는 메모리)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 3000);
process.env.PORT = String(port);
process.env.STORE ||= 'memory';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function serveStatic(pathname, res) {
  let p = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (p.startsWith('..') || p.startsWith('node_modules') || p.startsWith('lib') || p.startsWith('scripts')) return false;
  let file = join(root, p);
  try {
    const s = await stat(file);
    if (s.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(308, { Location: pathname + '/' }); res.end(); return true; }
      file = join(file, 'index.html');
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
    return true;
  } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const rel = url.pathname.replace(/\/$/, '') + '.js';
    const file = join(root, rel);
    if (!normalize(file).startsWith(join(root, 'api'))) { res.writeHead(404); return res.end(); }
    try {
      await stat(file);
    } catch { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"ok":false,"error":"없는 API"}'); }
    const mod = await import(pathToFileURL(file).href);
    return mod.default(req, res);
  }
  if (!(await serveStatic(url.pathname, res))) { res.writeHead(404); res.end('Not found'); }
});

server.listen(port, () => console.log(`dev server: http://localhost:${port}  (store=${process.env.STORE})`));
