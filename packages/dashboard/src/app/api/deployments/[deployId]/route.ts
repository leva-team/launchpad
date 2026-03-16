import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getDeployment,
  transitionDeployment,
  createApproval,
  getApproval,
  listQAResults,
  saveQAResult,
} from "@/lib/aws/deployment-manager";
import { getService } from "@/lib/aws/service-manager";
import type { PipelineStatus, QAResult } from "@launchpad/shared";
import { nanoid } from "nanoid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deployId: string }> }
) {
  try {
    await requireAuth();
    const { deployId } = await params;
    const deployment = await getDeployment(deployId);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const [approval, qaResults] = await Promise.all([
      getApproval(deployId),
      listQAResults(deployId),
    ]);

    return NextResponse.json({ deployment, approval, qaResults });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to get deployment" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deployId: string }> }
) {
  try {
    const { user } = await requireAuth();
    const { deployId } = await params;
    const { action, comment, qaType } = await request.json();

    const deploy = await getDeployment(deployId);
    if (!deploy) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const service = await getService(deploy.serviceId);

    switch (action) {
      case "build": {
        const updated = await transitionDeployment(deployId, "building", user.userId);
        setTimeout(async () => {
          try {
            const imageUri = `${process.env.AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com/${service?.name ?? "svc"}:${deploy.version}`;
            await transitionDeployment(deployId, "deploying_stg", user.userId, "Build complete", { dockerImageUri: imageUri });
            setTimeout(async () => {
              try {
                await transitionDeployment(deployId, "stg_active", user.userId, "STG deployment healthy", {
                  environments: {
                    ...deploy.environments,
                    stg: { taskArn: `arn:aws:ecs:ap-northeast-2:stg:task/${nanoid(8)}`, clusterArn: "arn:aws:ecs:ap-northeast-2:stg:cluster/launchpad-stg", deployedAt: new Date().toISOString() },
                  },
                });
              } catch (e) { console.error("STG deploy sim failed:", e); }
            }, 5000);
          } catch (e) { console.error("Build sim failed:", e); }
        }, 3000);
        return NextResponse.json({ deployment: updated });
      }

      case "start_qa": {
        const updated = await transitionDeployment(deployId, "qa_running", user.userId);
        const qaResult: QAResult = {
          qaRunId: nanoid(12),
          deployId,
          type: qaType ?? "scenario",
          status: "running",
          triggeredBy: user.userId,
          startedAt: new Date().toISOString(),
        };
        await saveQAResult(qaResult);
        return NextResponse.json({ deployment: updated, qaResult });
      }

      case "complete_qa": {
        const qaResults = await listQAResults(deployId);
        const running = qaResults.find((q) => q.status === "running");
        if (running) {
          const completed: QAResult = {
            ...running,
            status: "passed",
            completedAt: new Date().toISOString(),
            summary: { totalTests: 42, passed: 42, failed: 0, duration: 120 },
          };
          await saveQAResult(completed);
        }

        if (!service) throw new Error("Service not found");

        const updated = await transitionDeployment(deployId, "pending_approval", user.userId, "All QA passed");

        for (const approverId of service.approverUserIds) {
          await createApproval(deployId, service.serviceId, service.name, approverId);
        }
        if (service.approverUserIds.length === 0) {
          await createApproval(deployId, service.serviceId, service.name, service.ownerUserId);
        }

        return NextResponse.json({ deployment: updated });
      }

      case "fail_qa": {
        const qaResults = await listQAResults(deployId);
        const running = qaResults.find((q) => q.status === "running");
        if (running) {
          await saveQAResult({ ...running, status: "failed", completedAt: new Date().toISOString(), summary: { totalTests: 42, passed: 38, failed: 4, duration: 95 } });
        }
        const updated = await transitionDeployment(deployId, "qa_failed", user.userId, comment ?? "QA failed");
        return NextResponse.json({ deployment: updated });
      }

      case "deploy_prd": {
        const updated = await transitionDeployment(deployId, "deploying_prd", user.userId);
        setTimeout(async () => {
          try {
            await transitionDeployment(deployId, "ready_for_cutover", user.userId, "PRD replacement task set running", {
              environments: {
                ...deploy.environments,
                prd: { taskArn: `arn:aws:ecs:ap-northeast-2:prd:task/${nanoid(8)}`, clusterArn: "arn:aws:ecs:ap-northeast-2:prd:cluster/launchpad-prd", codeDeployId: `d-${nanoid(8)}`, deployedAt: new Date().toISOString() },
              },
            });
          } catch (e) { console.error("PRD deploy sim failed:", e); }
        }, 5000);
        return NextResponse.json({ deployment: updated });
      }

      case "cutover": {
        const updated = await transitionDeployment(deployId, "live", user.userId, "Cutover confirmed");
        return NextResponse.json({ deployment: updated });
      }

      case "rollback": {
        const updated = await transitionDeployment(deployId, "rolled_back", user.userId, comment ?? "Manual rollback");
        return NextResponse.json({ deployment: updated });
      }

      case "retry": {
        let target: PipelineStatus;
        if (deploy.status === "build_failed") target = "building";
        else if (deploy.status === "stg_failed") target = "deploying_stg";
        else if (deploy.status === "qa_failed") target = "qa_running";
        else if (deploy.status === "prd_failed") target = "deploying_prd";
        else return NextResponse.json({ error: "Cannot retry from this state" }, { status: 400 });

        const updated = await transitionDeployment(deployId, target, user.userId, "Retry");
        return NextResponse.json({ deployment: updated });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/deployments/:id error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
