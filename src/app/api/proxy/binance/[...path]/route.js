export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req, { params }) {
  return handleProxy(req, params);
}

export async function POST(req, { params }) {
  return handleProxy(req, params);
}

export async function OPTIONS(req) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  });
}

async function handleProxy(req, params) {
  try {
    const rawPath = Array.isArray(params?.path) ? params.path.join('/') : (params?.path || '');
    const url = new URL(req.url);
    const targetUrl = `https://www.binance.com/${rawPath}${url.search}`;

    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    headers.set('Host', 'www.binance.com');

    const method = req.method.toUpperCase();
    const body = (method !== 'GET' && method !== 'HEAD') ? await req.arrayBuffer() : undefined;

    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: 'follow'
    });

    const resHeaders = new Headers();
    res.headers.forEach((val, key) => {
      if (!['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
        resHeaders.set(key, val);
      }
    });

    const resData = await res.arrayBuffer();
    return new Response(resData, {
      status: res.status,
      headers: resHeaders
    });
  } catch (err) {
    return Response.json({
      success: false,
      error: `Proxy error: ${err.message}`
    }, { status: 502 });
  }
}
