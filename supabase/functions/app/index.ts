const functionPrefix = '/functions/v1/app';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function routePath(req: Request) {
  const url = new URL(req.url);
  let path = decodeURIComponent(url.pathname);
  const index = path.indexOf(functionPrefix);
  if (index >= 0) path = path.slice(index + functionPrefix.length) || '/';
  else if (path === '/app' || path.startsWith('/app/')) path = path.slice('/app'.length) || '/';
  return path;
}

function extension(path: string) {
  const match = /\.[A-Za-z0-9]+$/.exec(path);
  return match?.[0].toLowerCase() || '';
}

function safeAssetPath(path: string) {
  const clean = path.replace(/^\/+/, '');
  if (!clean || clean.includes('..') || clean.includes('\\')) return 'index.html';
  return clean;
}

async function readAsset(path: string) {
  return await Deno.readFile(`./dist/${safeAssetPath(path)}`);
}

function response(body: BodyInit, status = 200, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

Deno.serve(async (req) => {
  const path = routePath(req);
  const ext = extension(path);
  const assetPath = path === '/' || !ext ? 'index.html' : path;

  try {
    const body = await readAsset(assetPath);
    const isIndex = assetPath === 'index.html';
    return response(body, 200, {
      'Content-Type': contentTypes[extension(assetPath)] || 'application/octet-stream',
      'Cache-Control': isIndex ? 'no-store' : 'public, max-age=31536000, immutable',
    });
  } catch (error) {
    if (ext) return response('Not found', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    try {
      return response(await readAsset('index.html'), 200, {
        'Content-Type': contentTypes['.html'],
        'Cache-Control': 'no-store',
      });
    } catch (_innerError) {
      console.error(error);
      return response('App bundle not found', 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  }
});
