import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { PROJECT_PREFIX, COGNITO_USER_POOL_NAME } from "@launchpad/shared";

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.IUserPool;
  public readonly userPoolClient: cognito.IUserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── User Pool ─────────────────────────────────────────
    const pool = new cognito.UserPool(this, "UserPool", {
      userPoolName: COGNITO_USER_POOL_NAME,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.userPool = pool;

    // ─── User Pool Client ──────────────────────────────────
    const client = pool.addClient("DashboardClient", {
      userPoolClientName: `${PROJECT_PREFIX}-dashboard`,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          "http://localhost:3001/api/auth/callback",
          "https://launchpad.adreamer.now/api/auth/callback",
        ],
        logoutUrls: [
          "http://localhost:3001",
          "https://launchpad.adreamer.now",
        ],
      },
      preventUserExistenceErrors: true,
    });
    this.userPoolClient = client;

    // ─── User Pool Domain ──────────────────────────────────
    this.userPoolDomain = pool.addDomain("Domain", {
      cognitoDomain: {
        domainPrefix: PROJECT_PREFIX,
      },
    });

    // ─── Admin Group ───────────────────────────────────────
    new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      userPoolId: pool.userPoolId,
      groupName: "admins",
      description: "Platform administrators",
    });

    // ─── Outputs ───────────────────────────────────────────
    new cdk.CfnOutput(this, "UserPoolId", {
      value: pool.userPoolId,
      exportName: `${PROJECT_PREFIX}-user-pool-id`,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: client.userPoolClientId,
      exportName: `${PROJECT_PREFIX}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, "UserPoolDomainPrefix", {
      value: this.userPoolDomain.domainName,
      exportName: `${PROJECT_PREFIX}-user-pool-domain`,
    });
  }
}
