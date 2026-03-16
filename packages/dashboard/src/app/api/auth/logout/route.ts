import { NextResponse } from "next/server";
import { getCognitoLogoutUrl } from "@/lib/auth";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

function logout() {
  const logoutUrl = getCognitoLogoutUrl();
  const response = NextResponse.redirect(logoutUrl);
  response.cookies.delete("id_token");
  response.cookies.delete("access_token");
  response.cookies.delete("refresh_token");
  return response;
}

export async function GET() {
  return logout();
}

export async function POST() {
  return logout();
}
