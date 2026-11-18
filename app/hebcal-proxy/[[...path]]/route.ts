/** Proxies Hebcal so the calendar can be embedded. Hebcal only allows https parents to frame it. */

const ORIGIN = "https://www.hebcal.com";
const PREFIX = "/hebcal-proxy";

type Context = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, context: Context) {
  return proxyHebcal(request, context);
}

export async function POST(request: Request, context: Context) {
  return proxyHebcal(request, context);
}

async function proxyHebcal(request: Request, context: Context) {
  const { path = [] } = await context.params;
  if (path.some((segment) => segment === ".." || segment.includes("\\"))) return new Response("הנתיב אינו תקין", { status: 400 });
  const incoming = new URL(request.url);
  const target = new URL(ORIGIN);
  target.pathname = `/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  target.search = incoming.search;
  const headers = new Headers();
  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("user-agent", "Mozilla/5.0");
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });
  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response(null, { status: upstream.status, headers: { location: rewriteLocation(upstream.headers.get("location")) } });
  }
  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  const out = new Headers();
  out.set("content-type", type);
  out.set("cache-control", "private, max-age=300");
  const policy = relaxPolicy(upstream.headers.get("content-security-policy"));
  if (policy) out.set("content-security-policy", policy);
  if (type.includes("text/html") || type.includes("text/css")) {
    return new Response(rewriteDocument(await upstream.text()), { status: upstream.status, headers: out });
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

function relaxPolicy(value: string | null) {
  if (!value) return "";
  return value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.toLowerCase().startsWith("frame-ancestors"))
    .join("; ");
}

function rewriteLocation(value: string | null) {
  if (!value) return PREFIX;
  try {
    const url = new URL(value, ORIGIN);
    if (url.origin !== ORIGIN) return url.toString();
    return `${PREFIX}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return PREFIX;
  }
}

function rewriteDocument(text: string) {
  return text
    .replaceAll('href="/', `href="${PREFIX}/`)
    .replaceAll("href='/", `href='${PREFIX}/`)
    .replaceAll('src="/', `src="${PREFIX}/`)
    .replaceAll("src='/", `src='${PREFIX}/`)
    .replaceAll('action="/', `action="${PREFIX}/`)
    .replaceAll("action='/", `action='${PREFIX}/`)
    .replaceAll("https://www.hebcal.com/", `${PREFIX}/`)
    .replaceAll("https://hebcal.com/", `${PREFIX}/`)
    .replace(/url\(\s*(['"]?)\//g, `url($1${PREFIX}/`);
}
