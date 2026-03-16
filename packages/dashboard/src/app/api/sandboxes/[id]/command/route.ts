import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSandbox } from "@/lib/aws/sandbox-provisioner";
import { SendCommandCommand, GetCommandInvocationCommand } from "@aws-sdk/client-ssm";
import { ssmClient } from "@/lib/aws/clients";

const ALLOWED_COMMANDS: Record<string, string[]> = {
  "opencode-restart": [
    "su - ubuntu -c 'pm2 restart opencode 2>/dev/null || pm2 start opencode -- web --port 3000 --hostname 0.0.0.0'",
    "su - ubuntu -c 'pm2 save'",
  ],
  "opencode-stop": [
    "su - ubuntu -c 'pm2 stop opencode'",
  ],
  "opencode-logs": [
    "su - ubuntu -c 'pm2 logs opencode --lines 50 --nostream'",
  ],
  "opencode-status": [
    "su - ubuntu -c 'pm2 jlist'",
  ],
  "system-status": [
    "echo '{\"uptime\":\"'$(uptime -p)'\",\"disk\":\"'$(df -h / --output=pcent | tail -1 | tr -d ' ')'\",\"memory\":\"'$(free -m | awk '/Mem:/ {printf \"%d/%dMB\", $3, $2}')'\",\"caddy\":\"'$(systemctl is-active caddy)'\"}'",
  ],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth();
    const { id } = await params;
    const { command }: { command: string } = await request.json();

    if (!command || !ALLOWED_COMMANDS[command]) {
      return NextResponse.json(
        { error: `Invalid command. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(", ")}` },
        { status: 400 }
      );
    }

    const sandbox = await getSandbox(user.userId, id);
    if (!sandbox || !sandbox.instanceId) {
      return NextResponse.json({ error: "Sandbox not found" }, { status: 404 });
    }
    if (sandbox.status !== "running") {
      return NextResponse.json({ error: "Sandbox is not running" }, { status: 400 });
    }

    const { Command } = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [sandbox.instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: { commands: ["#!/bin/bash", "set -eux", ...ALLOWED_COMMANDS[command]] },
        TimeoutSeconds: 30,
      })
    );

    const commandId = Command?.CommandId;
    if (!commandId) {
      return NextResponse.json({ error: "Failed to send command" }, { status: 500 });
    }

    await new Promise((r) => setTimeout(r, 5000));

    const { StandardOutputContent, StandardErrorContent, Status } = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: sandbox.instanceId,
      })
    );

    return NextResponse.json({
      status: Status,
      output: StandardOutputContent ?? "",
      error: StandardErrorContent ?? "",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/sandboxes/:id/command error:", err);
    return NextResponse.json({ error: "Command execution failed" }, { status: 500 });
  }
}
