import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
        userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID as string,
        userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID as string,
    },
  },
});


