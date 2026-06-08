const functionPrefix = '/functions/v1/app';
const siteUrl = 'https://su27.github.io/mdpaste/';

function routePath(req: Request) {
  const url = new URL(req.url);
  let path = decodeURIComponent(url.pathname);
  const index = path.indexOf(functionPrefix);
  if (index >= 0) path = path.slice(index + functionPrefix.length) || '/';
  else if (path === '/app' || path.startsWith('/app/')) path = path.slice('/app'.length) || '/';
  return path;
}

Deno.serve((req) => {
  const path = routePath(req);
  const location = path === '/' ? siteUrl : `${siteUrl}#${path}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
    },
  });
});
