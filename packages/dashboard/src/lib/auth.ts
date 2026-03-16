/**
 * Cognito JWT 인증 — jose 라이브러리로 토큰 검증
 * httpOnly 쿠키에 저장된 idToken을 검증하여 사용자 정보 추출
 */

import { jwtVerify, createRemoteJWKSet } from "jose";
import { cookies } from "next/headers";
import type { User } from "@launchpad/shared";

const COGNITO_REGION = process.env.AWS_REGION ?? "ap-northeast-2";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;

const ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}`;
const JWKS_URI = `${ISSUER}/.well-known/jwks.json`;

// JWKS 캐시 — 콜드 스타트 시 한 번만 fetch
const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export interface AuthResult {
  user: User;
  token: string;
}

/**
 * 현재 요청의 인증 상태를 확인.
 * 인증되지 않은 경우 null 반환.
 */
export async function getAuthUser(): Promise<AuthResult | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("id_token")?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
    });

    // Cognito client_id 수동 검증 (aud 또는 client_id 클레임)
    const tokenAud = payload.aud;
    const tokenClientId = payload.client_id as string | undefined;
    const clientId = process.env.COGNITO_CLIENT_ID;
    if (clientId && tokenAud !== clientId && tokenClientId !== clientId) {
      console.error("JWT audience mismatch:", { tokenAud, tokenClientId, expectedClientId: clientId });
      return null;
    }

    const user: User = {
      userId: payload.sub!,
      email: (payload.email as string) ?? "",
      name: (payload.name as string) ?? (payload.email as string) ?? "",
      cognitoSub: payload.sub!,
      createdAt: new Date((payload.auth_time as number) * 1000).toISOString(),
    };

    return { user, token };
  } catch (err) {
    console.error("JWT verification failed:", err);
    return null;
  }
}

/**
 * 인증 필수 API route에서 사용.
 * 인증 실패 시 throw.
 */
export async function requireAuth(): Promise<AuthResult> {
  const auth = await getAuthUser();
  if (!auth) {
    throw new Error("Unauthorized");
  }
  return auth;
}

/**
 * Cognito 로그인 URL 생성
 */
export function getCognitoLoginUrl(redirectUri: string): string {
  const domain = process.env.COGNITO_DOMAIN!;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid email profile",
  });
  return `https://${domain}/login?${params.toString()}`;
}

/**
 * Cognito 로그아웃 URL 생성
 */
export function getCognitoLogoutUrl(): string {
  const domain = process.env.COGNITO_DOMAIN!;
  const clientId = process.env.COGNITO_CLIENT_ID!;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3001";
  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: baseUrl,
  });
  return `https://${domain}/logout?${params.toString()}`;
}
