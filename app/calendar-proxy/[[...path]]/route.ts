/** Proxies the 2net calendar so it can be shown inside the app. The site sends X-Frame-Options: SAMEORIGIN. */

const ORIGIN = "https://calendar.2net.co.il";
const PREFIX = "/calendar-proxy";

type Context = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, context: Context) {
  return proxyCalendar(request, context);
}

export async function POST(request: Request, context: Context) {
  return proxyCalendar(request, context);
}

async function proxyCalendar(request: Request, context: Context) {
  const { path = [] } = await context.params;
  if (path.some((segment) => segment === ".." || segment.includes("\\"))) return new Response("הנתיב אינו תקין", { status: 400 });
  const incoming = new URL(request.url);
  const target = new URL(ORIGIN);
  target.pathname = `/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  target.search = incoming.search;
  const headers = new Headers();
  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = request.headers.get("content-type");
  if (contentType && request.method !== "GET" && request.method !== "HEAD") headers.set("content-type", contentType);
  headers.set("user-agent", request.headers.get("user-agent") || "Mozilla/5.0");
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });
  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response(null, {
      status: upstream.status,
      headers: { location: rewriteLocation(upstream.headers.get("location")) },
    });
  }
  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  const out = new Headers();
  out.set("content-type", type);
  out.set("cache-control", upstream.headers.get("cache-control") || "private, max-age=60");
  for (const cookieHeader of upstream.headers.getSetCookie()) out.append("set-cookie", rewriteCookie(cookieHeader));
  if (type.includes("text/html")) return new Response(rewriteHtml(await upstream.text()), { status: upstream.status, headers: out });
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

function rewriteCookie(cookie: string) {
  const withoutDomain = cookie.replace(/;\s*domain=[^;]*/gi, "");
  if (/;\s*path=/i.test(withoutDomain)) return withoutDomain.replace(/;\s*path=[^;]*/i, `; Path=${PREFIX}`);
  return `${withoutDomain}; Path=${PREFIX}`;
}

function rewriteLocation(value: string | null) {
  if (!value) return `${PREFIX}/`;
  try {
    const url = new URL(value, ORIGIN);
    if (url.origin !== ORIGIN) return url.toString();
    return `${PREFIX}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `${PREFIX}/`;
  }
}

function rewriteHtml(text: string) {
  const rewritten = text
    .replaceAll('href="/', `href="${PREFIX}/`)
    .replaceAll("href='/", `href='${PREFIX}/`)
    .replaceAll('src="/', `src="${PREFIX}/`)
    .replaceAll("src='/", `src='${PREFIX}/`)
    .replaceAll('action="/', `action="${PREFIX}/`)
    .replaceAll("action='/", `action='${PREFIX}/`)
    .replaceAll('="../', `="${PREFIX}/`)
    .replaceAll("='../", `='${PREFIX}/`)
    .replaceAll('action="./"', `action="${PREFIX}"`)
    .replaceAll("action='./'", `action='${PREFIX}'`)
    .replaceAll(`${ORIGIN}/`, `${PREFIX}/`);
  const style = `<style>.pirsomet.up,.pirsomet.up .adsbygoogle,.pirsometLink{display:none !important;height:0 !important;margin:0 !important;}</style>`;
  return rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${PREFIX}/">${style}`);
}
