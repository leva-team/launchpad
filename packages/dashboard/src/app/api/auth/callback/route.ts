import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/login?error=no_code`);
  }

  try {
    const domain = process.env.COGNITO_DOMAIN!;
    const clientId = process.env.COGNITO_CLIENT_ID!;
    const redirectUri = `${BASE_URL}/api/auth/callback`;

    const tokenResponse = await fetch(`https://${domain}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("Token exchange failed:", error);
      return NextResponse.redirect(`${BASE_URL}/login?error=token_exchange`);
    }

    const tokens = await tokenResponse.json();

    const response = NextResponse.redirect(`${BASE_URL}/dashboard`);

    const cookieOptions = {
      httpOnly: true,
      secure: BASE_URL.startsWith("https"),
      sameSite: "lax" as const,
      path: "/",
    };

    response.cookies.set("id_token", tokens.id_token, {
      ...cookieOptions,
      maxAge: 86400,
    });

    response.cookies.set("access_token", tokens.access_token, {
      ...cookieOptions,
      maxAge: 3600,
    });

    response.cookies.set("refresh_token", tokens.refresh_token, {
      ...cookieOptions,
      maxAge: 2592000,
    });

    return response;
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(`${BASE_URL}/login?error=callback_error`);
  }
}
