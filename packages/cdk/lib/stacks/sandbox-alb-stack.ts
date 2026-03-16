import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { PROJECT_PREFIX, SANDBOX_SUBDOMAIN, BASE_DOMAIN } from "@launchpad/shared";

interface SandboxAlbStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  albSecurityGroup: ec2.ISecurityGroup;
}

export class SandboxAlbStack extends cdk.Stack {
  public readonly alb: elbv2.IApplicationLoadBalancer;
  public readonly httpsListener: elbv2.IApplicationListener;

  constructor(scope: Construct, id: string, props: SandboxAlbStackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: "Z04073322KDAUU798ABJ0",
        zoneName: BASE_DOMAIN,
      }
    );

    // ─── ACM Certificate ───────────────────────────────────
    const certificate = new acm.Certificate(this, "SandboxWildcardCert", {
      domainName: `*.${SANDBOX_SUBDOMAIN}.${BASE_DOMAIN}`,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ─── ALB ───────────────────────────────────────────────
    this.alb = new elbv2.ApplicationLoadBalancer(this, "SandboxAlb", {
      loadBalancerName: `${PROJECT_PREFIX}-sandbox-alb`,
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: props.albSecurityGroup,
    });

    // ─── HTTPS Listener (443) ──────────────────────────────
    this.httpsListener = this.alb.addListener("HttpsListener", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(503, {
        contentType: "text/plain",
        messageBody: "Sandbox not found",
      }),
    });

    // ─── HTTP Listener (80) → HTTPS Redirect ───────────────
    this.alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    // ─── Route53 Wildcard A Record ─────────────────────────
    new route53.ARecord(this, "SandboxWildcardRecord", {
      zone: hostedZone,
      recordName: `*.${SANDBOX_SUBDOMAIN}`,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(this.alb)
      ),
    });

    // ─── Outputs ───────────────────────────────────────────
    new cdk.CfnOutput(this, "AlbArn", {
      value: this.alb.loadBalancerArn,
      exportName: `${PROJECT_PREFIX}-sandbox-alb-arn`,
    });

    new cdk.CfnOutput(this, "HttpsListenerArn", {
      value: this.httpsListener.listenerArn,
      exportName: `${PROJECT_PREFIX}-sandbox-https-listener-arn`,
    });
  }
}
