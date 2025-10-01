"use client";

import { signIn } from "aws-amplify/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn({ username: email, password });

      // Get the token and store it in a server-side cookie
      const { fetchAuthSession } = await import("aws-amplify/auth");
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (token) {
        await fetch("/api/auth/set-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
      }

      router.replace("/tools");
    } catch (err: unknown) {
      console.error("Login error:", err);
      const errorName = (() => {
        if (typeof err === "object" && err !== null && "name" in err) {
          return String((err as { name?: unknown }).name ?? "");
        }
        return "";
      })();
      if (errorName === "UserAlreadyAuthenticatedException") {
        router.replace("/tools");
        return;
      }
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Access your account to start chatting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button onClick={handleLogin} disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign In"}
          </Button>
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
