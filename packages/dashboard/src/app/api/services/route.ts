import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createService, listServices } from "@/lib/aws/service-manager";
import type { CreateServiceRequest } from "@launchpad/shared";

export async function GET() {
  try {
    await requireAuth();
    const services = await listServices();
    return NextResponse.json({ services });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to list services" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const body: CreateServiceRequest = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Service name is required" }, { status: 400 });
    }
    if (!body.description?.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }
    if (!body.purpose?.trim()) {
      return NextResponse.json({ error: "Purpose is required" }, { status: 400 });
    }
    if (!body.ownerTeam?.trim()) {
      return NextResponse.json({ error: "Owner team is required" }, { status: 400 });
    }

    const service = await createService(user.userId, user.name, body);
    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/services error:", err);
    return NextResponse.json({ error: "Failed to create service" }, { status: 500 });
  }
}
