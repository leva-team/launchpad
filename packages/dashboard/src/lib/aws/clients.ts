import { EC2Client } from "@aws-sdk/client-ec2";
import { IAMClient } from "@aws-sdk/client-iam";
import { Route53Client } from "@aws-sdk/client-route-53";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SSMClient } from "@aws-sdk/client-ssm";
import {
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";

const region = process.env.AWS_REGION ?? "ap-northeast-2";

export const ec2Client = new EC2Client({ region });
export const iamClient = new IAMClient({ region });
export const route53Client = new Route53Client({ region: "us-east-1" }); // Route53 is global
export const ssmClient = new SSMClient({ region });
export const cognitoClient = new CognitoIdentityProviderClient({ region });
export const elbv2Client = new ElasticLoadBalancingV2Client({ region });

const ddbClient = new DynamoDBClient({ region });
export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
