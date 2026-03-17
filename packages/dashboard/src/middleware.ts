import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Edge Middleware — 인증 보호 라우트 설정
 * Edge에서는 jose 사용 불가하므로 쿠키 존재 여부만 체크.
 * 실제 JWT 검증은 API route / Server Component에서 수행.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — 인증 불필요
  const publicPaths = ["/login", "/api/auth", "/_next", "/favicon.ico"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const idToken = request.cookies.get("id_token")?.value;
  if (!idToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized", redirect: "/login" }, { status: 401 });
    }
    const baseUrl = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
