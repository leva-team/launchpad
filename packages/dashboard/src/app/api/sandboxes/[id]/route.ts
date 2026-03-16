import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getSandbox,
  getSandboxByIdPublic,
  terminateSandbox,
  controlSandbox,
} from "@/lib/aws/sandbox-provisioner";
import type { UpdateSandboxRequest } from "@launchpad/shared";

/**
 * GET /api/sandboxes/:id — 샌드박스 상세 조회
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth();
    const { id } = await params;
    let sandbox = await getSandbox(user.userId, id);

    if (!sandbox) {
      sandbox = await getSandboxByIdPublic(id);
    }

    if (!sandbox) {
      return NextResponse.json(
        { error: "Sandbox not found" },
        { status: 404 }
      );
    }

    const isOwner = sandbox.userId === user.userId;
    return NextResponse.json({ sandbox, isOwner });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/sandboxes/:id error:", err);
    return NextResponse.json(
      { error: "Failed to get sandbox" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sandboxes/:id — 샌드박스 제어 (start/stop/reboot)
 *
 * Body: { action: "start" | "stop" | "reboot" }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth();
    const { id } = await params;
    const body: UpdateSandboxRequest = await request.json();

    if (body.action === "change-slug" && body.slug) {
      const { changeSlug } = await import("@/lib/aws/sandbox-provisioner");
      const sandbox = await changeSlug(user.userId, id, body.slug);
      return NextResponse.json({ sandbox });
    }

    if (body.action === "change-visibility" && body.visibility) {
      const { changeVisibility } = await import("@/lib/aws/sandbox-provisioner");
      const sandbox = await changeVisibility(user.userId, id, body.visibility as "public" | "private");
      return NextResponse.json({ sandbox });
    }

    if (body.action === "change-instance-type" && body.instanceType) {
      const { changeInstanceType, getSandbox: getSb } = await import("@/lib/aws/sandbox-provisioner");
      changeInstanceType(user.userId, id, body.instanceType).catch((err) =>
        console.error("changeInstanceType background error:", err)
      );
      const current = await getSb(user.userId, id);
      return NextResponse.json({ sandbox: current });
    }

    if (!body.action) {
      return NextResponse.json(
        { error: "Action is required" },
        { status: 400 }
      );
    }

    const validActions = ["start", "stop", "reboot"] as const;
    if (!validActions.includes(body.action as typeof validActions[number])) {
      return NextResponse.json(
        { error: "Invalid action. Must be: start, stop, reboot" },
        { status: 400 }
      );
    }

    const sandbox = await controlSandbox(user.userId, id, body.action as "start" | "stop" | "reboot");
    return NextResponse.json({ sandbox });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PUT /api/sandboxes/:id error:", err);
    return NextResponse.json(
      { error: "Failed to control sandbox" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sandboxes/:id — 샌드박스 종료 및 리소스 정리
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth();
    const { id } = await params;

    const sandbox = await getSandbox(user.userId, id);
    if (!sandbox) {
      return NextResponse.json(
        { error: "Sandbox not found" },
        { status: 404 }
      );
    }

    await terminateSandbox(user.userId, id);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/sandboxes/:id error:", err);
    return NextResponse.json(
      { error: "Failed to terminate sandbox" },
      { status: 500 }
    );
  }
}
