import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listPendingApprovals, respondApproval } from "@/lib/aws/deployment-manager";

export async function GET() {
  try {
    const { user } = await requireAuth();
    const approvals = await listPendingApprovals(user.userId);
    return NextResponse.json({ approvals });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to list approvals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const { deployId, approvalId, approved, comment } = await request.json();

    if (!deployId || !approvalId || approved === undefined) {
      return NextResponse.json({ error: "deployId, approvalId, approved are required" }, { status: 400 });
    }

    const approval = await respondApproval(deployId, approvalId, approved, comment ?? "", user.userId);
    return NextResponse.json({ approval });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/approvals error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
