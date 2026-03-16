import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createDeployment, listDeployments } from "@/lib/aws/deployment-manager";
import { getService } from "@/lib/aws/service-manager";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    await requireAuth();
    const { serviceId } = await params;
    const deployments = await listDeployments(serviceId);
    return NextResponse.json({ deployments });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to list deployments" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  try {
    const { user } = await requireAuth();
    const { serviceId } = await params;
    const { version, sandboxId } = await request.json();

    const service = await getService(serviceId);
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    if (!version?.trim()) {
      return NextResponse.json({ error: "Version is required" }, { status: 400 });
    }

    const deployment = await createDeployment(serviceId, version, user.userId, sandboxId);
    return NextResponse.json({ deployment }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/services/:id/deployments error:", err);
    return NextResponse.json({ error: "Failed to create deployment" }, { status: 500 });
  }
}
