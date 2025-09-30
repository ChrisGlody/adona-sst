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
    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      usernames: ["email"]
    });

    const webClient = userPool.addClient("Web")

    new sst.aws.Nextjs("Adona", {
      path: "app",
      link: [userPool],
      environment: {
        NEXT_PUBLIC_USER_POOL_ID: userPool.id,
        NEXT_PUBLIC_USER_POOL_CLIENT_ID: webClient.id,
        NEXT_PUBLIC_AWS_REGION: $app.providers?.aws.region,
      }
    });
  },
});

