import { createD1Store, ApiError } from './store.js';

export function createHandler(assets) {
  return async function fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' https://media3.bosch-home.com https://img01.ztat.net https://www.jousenshoes.com https://skailama-demo.myshopify.com; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'"
    };
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    try {
      if (request.method === 'GET' && Object.hasOwn(assets, url.pathname)) {
        const asset = assets[url.pathname];
        return new Response(asset.body, { headers: { ...headers, 'Content-Type': asset.type } });
      }
      if (request.method === 'GET' && url.pathname === '/api/health') {
        if (!env.DB) throw new Error('D1 binding DB is missing');
        await env.DB.prepare('SELECT 1 FROM products LIMIT 1').first();
        return json(200, { status: 'ok' });
      }
      if (request.method === 'GET' && url.pathname === '/api/products') {
        const q = url.searchParams.get('q') || '';
        if (q.length > 100) throw new ApiError(400, 'La búsqueda es demasiado larga.');
        const products = await createD1Store(env.DB).list({ q, category: url.searchParams.get('category') || '', sort: url.searchParams.get('sort') || 'featured' });
        return json(200, { products, currency: 'ARS' });
      }
      if (request.method === 'POST' && url.pathname === '/api/orders') {
        const origin = request.headers.get('origin');
        if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== url.origin)) throw new ApiError(403, 'Origen no permitido.');
        if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw new ApiError(415, 'Se requiere application/json.');
        if (Number(request.headers.get('content-length')) > 16384) throw new ApiError(413, 'El pedido es demasiado grande.');
        const reader = request.body?.getReader();
        if (!reader) throw new ApiError(400, 'JSON no válido.');
        const chunks = []; let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 16384) { await reader.cancel(); throw new ApiError(413, 'El pedido es demasiado grande.'); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        let body;
        try { body = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { throw new ApiError(400, 'JSON no válido.'); }
        const order = await createD1Store(env.DB).checkout(body, request.headers.get('idempotency-key'));
        return json(order.replayed ? 200 : 201, order);
      }
      return json(404, { error: 'Recurso no encontrado.' });
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Market request failed', url.pathname, error);
      return json(error instanceof ApiError ? error.status : 503, { error: error instanceof ApiError ? error.message : 'El servicio no está disponible. Tu selección se conserva; volvé a intentar.' });
    }
  };
}
