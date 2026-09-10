import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createStore, ApiError } from './store.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicFiles = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/script.js': ['script.js', 'text/javascript'] };

export function createApp(store) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://media3.bosch-home.com https://img01.ztat.net https://www.jousenshoes.com https://skailama-demo.myshopify.com; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') return json(200, { status: 'ok' });
      if (req.method === 'GET' && url.pathname === '/api/products') {
        const q = url.searchParams.get('q') || '';
        if (q.length > 100) throw new ApiError(400, 'La búsqueda es demasiado larga.');
        return json(200, { products: store.list({ q, category: url.searchParams.get('category') || '', sort: url.searchParams.get('sort') || 'featured' }), currency: 'ARS' });
      }
      if (req.method === 'POST' && url.pathname === '/api/orders') {
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'Origen no permitido.');
        if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new ApiError(415, 'Se requiere application/json.');
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) throw new ApiError(413, 'El pedido es demasiado grande.');
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new ApiError(400, 'JSON no válido.'); }
        const order = store.checkout(body, req.headers['idempotency-key']);
        return json(order.replayed ? 200 : 201, order);
      }
      if (req.method === 'GET' && Object.hasOwn(publicFiles, url.pathname)) {
        const [file, type] = publicFiles[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        return res.end(readFileSync(resolve(root, file)));
      }
      return json(404, { error: 'Recurso no encontrado.' });
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Request failed:', error);
      return json(error.status || 500, { error: error instanceof ApiError ? error.message : 'No pudimos completar la operación. Intentá nuevamente.' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(process.env.DB_PATH || resolve(root, 'data/market.sqlite'));
  mkdirSync(dirname(path), { recursive: true });
  const store = createStore(path);
  const server = createApp(store);
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => console.log(`Colmena Market: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
