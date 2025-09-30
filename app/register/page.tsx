"use client";

import { signUp, UserAttributeKey } from "aws-amplify/auth";
import { confirmSignUp } from "aws-amplify/auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"signUp" | "confirm">("signUp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  
  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      await signUp({
        username: email,
        password,
      });
      setStep("confirm");
    } catch (err: unknown) {
      console.error("Sign up error:", err);
      setError("Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      router.replace("/login");
    } catch (err: unknown) {
      console.error("Confirm error:", err);
      setError("Confirmation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
          <CardDescription>Create your account to start chatting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "signUp" ? (
            <>
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
                <Button onClick={handleSignUp} disabled={loading} className="w-full">
                  {loading ? "Creating account..." : "Sign Up"}
                </Button>
              </>
            ) : (
              <>
                <Input
                  placeholder="Confirmation Code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button onClick={handleConfirm} disabled={loading}>
                  {loading ? "Confirming..." : "Confirm Sign Up"}
                </Button>
              </>
            )}
            {error ? <div className="text-sm text-destructive">{error}</div> : null}
          </CardContent>
        </Card>
      </div>
    );
}