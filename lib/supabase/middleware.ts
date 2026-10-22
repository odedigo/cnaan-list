import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function hasPublicEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function updateSession(request: NextRequest) {
  // A login or logout action writes the session cookies itself. Refreshing here
  // runs first and can replace that new session with the signed-out one.
  if (request.headers.has("next-action")) {
    return NextResponse.next({ request });
  }

  const path = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  if (!hasPublicEnv()) {
    return redirectAnonymous(request, path, response);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (path.startsWith("/auth/callback")) {
    return response;
  }

  if (!user && (path === "/" || path === "/inventory" || path === "/grocery" || path === "/lists")) {
    return redirectWithSession(request, response, "/settings");
  }

  if (user && path === "/") {
    return redirectWithSession(request, response, "/grocery");
  }

  if (user && (path === "/signup" || path === "/forgot-password")) {
    return redirectWithSession(request, response, "/settings");
  }

  return response;
}

function redirectAnonymous(request: NextRequest, path: string, response: NextResponse) {
  if (path === "/" || path === "/inventory" || path === "/grocery" || path === "/lists") {
    return redirectWithSession(request, response, "/settings");
  }
  return response;
}

function redirectWithSession(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const redirectResponse = NextResponse.redirect(url);
  // The session refresh writes cookies onto `response`. A bare redirect drops
  // them, the browser keeps a stale refresh token, and the next start looks logged out.
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}
