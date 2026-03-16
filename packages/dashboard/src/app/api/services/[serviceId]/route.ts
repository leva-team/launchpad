import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getService,
  updateService,
  deleteService,
  linkSandbox,
  unlinkSandbox,
} from "@/lib/aws/service-manager";
import type { UpdateServiceRequest } from "@launchpad/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    await requireAuth();
    const { serviceId } = await params;
    const service = await getService(serviceId);
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    return NextResponse.json({ service });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to get service" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    await requireAuth();
    const { serviceId } = await params;
    const body = await request.json();

    if (body.action === "link-sandbox" && body.sandboxId) {
      await linkSandbox(serviceId, body.sandboxId);
      const service = await getService(serviceId);
      return NextResponse.json({ service });
    }

    if (body.action === "unlink-sandbox" && body.sandboxId) {
      await unlinkSandbox(serviceId, body.sandboxId);
      const service = await getService(serviceId);
      return NextResponse.json({ service });
    }

    const updates: UpdateServiceRequest = body;
    const service = await updateService(serviceId, updates);
    return NextResponse.json({ service });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PUT /api/services/:id error:", err);
    return NextResponse.json({ error: "Failed to update service" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    await requireAuth();
    const { serviceId } = await params;
    await deleteService(serviceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }
}
