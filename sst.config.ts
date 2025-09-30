/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "adona-sst",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          profile: "adona-sst-profile",
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // Cognito for auth
    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      usernames: ["email"],
    });
    const webClient = userPool.addClient("Web");

    // S3 bucket to hold tool definitions & code
    const toolsBucket = new sst.aws.Bucket("ToolsBucket");

    // Runner Lambda
    const runner = new sst.aws.Function("ToolRunner", {
      handler: "lambdas/tool-runner.main",
      runtime: "nodejs18.x",
      link: [toolsBucket], // gives Lambda IAM to access bucket
      environment: {
        TOOLS_BUCKET: toolsBucket.name,
      },
    });

    
    new sst.aws.Nextjs("Adona", {
      path: ".",
      link: [userPool, toolsBucket, runner],
      environment: {
        NEXT_PUBLIC_USER_POOL_ID: userPool.id,
        NEXT_PUBLIC_USER_POOL_CLIENT_ID: webClient.id,
        NEXT_PUBLIC_AWS_REGION: $app.providers?.aws.region,
        TOOL_RUNNER_ARN: runner.arn,
        TOOLS_BUCKET_NAME: toolsBucket.name,
      },
    });
  },
});

