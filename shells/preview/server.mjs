/**
 * Zero-dependency preview server for the EduMind shells.
 *
 *   node shells/preview/server.mjs   →  http://localhost:8765/
 *
 * Routes:
 *   /                         harness UI
 *   /api/list                 available shells + sample specs
 *   /play/:game?spec=NAME     assembled shell (spec injected, like the backend does)
 *   /play/:game?spec=NAME&stub=1   stub-injected shell (progressive-start testing)
 *   /dist/*  /samples/*       raw artifacts
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellsDir = join(here, '..');
const root = join(shellsDir, '..');
const distDir = join(shellsDir, 'dist');
// Golden specs live in root /samples; curated lesson specs ship only with the
// app assets. The preview searches both (root wins on duplicate filenames).
const samplesDirs = [join(root, 'samples'), join(root, 'edumind-ui', 'assets', 'samples')];
const samplesDir = samplesDirs[0];

function findSpecFile(name) {
  for (const dir of samplesDirs) {
    const p = normalize(join(dir, name));
    if (p.startsWith(dir) && existsSync(p)) return p;
  }
  return null;
}

const PORT = process.env.PREVIEW_PORT || 8765;
const SPEC_MARKER = '/*__EDUMIND_SPEC_JSON__*/null';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

function safeJson(obj) {
  // escape `<` so spec content can never break out of the script tag
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'content-type': type || 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function buildStub(spec) {
  return {
    specVersion: 1,
    stub: true,
    meta: spec.meta,
    student: spec.student,
    levels: [],
  };
}

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === '/' || path === '/index.html') {
      return send(res, 200, readFileSync(join(here, 'index.html')), MIME['.html']);
    }

    if (path === '/api/list') {
      const shells = existsSync(distDir)
        ? readdirSync(distDir).filter((f) => f.endsWith('.html')).map((f) => f.replace('.html', ''))
        : [];
      const seen = new Map();
      for (const dir of samplesDirs) {
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
          if (seen.has(f)) continue; // root wins on duplicates
          const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
          seen.set(f, { file: f, gameType: j.meta.gameType, topic: j.meta.topic, language: j.meta.language, stub: !!j.stub });
        }
      }
      const specs = [...seen.values()];
      return send(res, 200, JSON.stringify({ shells, specs }), MIME['.json']);
    }

    const playMatch = path.match(/^\/play\/([a-z_]+)$/);
    if (playMatch) {
      const game = playMatch[1];
      const shellPath = join(distDir, `${game}.html`);
      if (!existsSync(shellPath)) return send(res, 404, `shell not built: ${game} — run: npm -w shells run build`);
      const specName = url.searchParams.get('spec');
      if (!specName) return send(res, 400, 'missing ?spec=');
      const specPath = findSpecFile(specName.replace(/^samples[\\/]/, ''));
      if (!specPath) return send(res, 404, `spec not found: ${specName}`);
      const spec = JSON.parse(readFileSync(specPath, 'utf8'));
      const wantStub = url.searchParams.get('stub') === '1';
      const inject = wantStub && !spec.stub ? buildStub(spec) : spec;
      const html = readFileSync(shellPath, 'utf8').replace(SPEC_MARKER, safeJson(inject));
      return send(res, 200, html, MIME['.html']);
    }

    if (path.startsWith('/dist/')) {
      const file = normalize(join(distDir, path.split('/').slice(2).join('/')));
      if (!file.startsWith(distDir) || !existsSync(file)) return send(res, 404, 'not found');
      const ext = file.slice(file.lastIndexOf('.'));
      return send(res, 200, readFileSync(file), MIME[ext] || 'application/octet-stream');
    }

    if (path.startsWith('/samples/')) {
      // Same dual-directory lookup as /play/ and /api/list — curated lesson
      // specs ship only under edumind-ui/assets/samples.
      const name = path.split('/').slice(2).join('/');
      const file = findSpecFile(name);
      if (!file) return send(res, 404, 'not found');
      return send(res, 200, readFileSync(file), MIME['.json']);
    }

    send(res, 404, 'not found');
  } catch (err) {
    send(res, 500, String(err && err.stack ? err.stack : err));
  }
});

server.listen(PORT, () => {
  console.log(`[preview] EduMind shell harness → http://localhost:${PORT}/`);
  console.log('[preview] tip: run "npm -w shells run build" after editing shell sources');
});
