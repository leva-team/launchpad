import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createSandbox,
  listUserSandboxes,
} from "@/lib/aws/sandbox-provisioner";
import type { CreateSandboxRequest } from "@launchpad/shared";
import { ALLOWED_INSTANCE_TYPES } from "@launchpad/shared";

/**
 * GET /api/sandboxes — 사용자의 샌드박스 목록 조회
 */
export async function GET() {
  try {
    const { user } = await requireAuth();
    const { mine, shared } = await listUserSandboxes(user.userId);

    return NextResponse.json({ sandboxes: mine, shared });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/sandboxes error:", err);
    return NextResponse.json(
      { error: "Failed to list sandboxes" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sandboxes — 새 샌드박스 생성
 *
 * Body: { name: string, description?: string, instanceType?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const body: CreateSandboxRequest = await request.json();

    // Validation
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "Sandbox name is required" },
        { status: 400 }
      );
    }

    if (body.name.length > 32) {
      return NextResponse.json(
        { error: "Sandbox name must be 32 characters or less" },
        { status: 400 }
      );
    }

    if (
      body.instanceType &&
      !ALLOWED_INSTANCE_TYPES.includes(body.instanceType as typeof ALLOWED_INSTANCE_TYPES[number])
    ) {
      return NextResponse.json(
        {
          error: `Invalid instance type. Allowed: ${ALLOWED_INSTANCE_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!body.slug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(body.slug)) {
      return NextResponse.json(
        { error: "Slug must be lowercase alphanumeric with hyphens only" },
        { status: 400 }
      );
    }

    const { mine: existing } = await listUserSandboxes(user.userId);
    if (existing.some((s) => s.slug === body.slug)) {
      return NextResponse.json(
        { error: `Sandbox slug "${body.slug}" already exists` },
        { status: 409 }
      );
    }

    const sandbox = await createSandbox(user.userId, body);

    return NextResponse.json({ sandbox }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/sandboxes error:", err);
    return NextResponse.json(
      { error: "Failed to create sandbox" },
      { status: 500 }
    );
  }
}
