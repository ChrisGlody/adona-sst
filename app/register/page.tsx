"use client";

import { signUp, UserAttributeKey } from "aws-amplify/auth";
import { confirmSignUp } from "aws-amplify/auth";
import { useState } from "react";

export default function RegisterPage() {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"signUp" | "confirm">("signUp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      alert("Registration confirmed. You can now sign in.");
    } catch (err: unknown) {
      console.error("Confirm error:", err);
      setError("Confirmation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
      }}
    >
        <p>Sign up</p>
        <p>USER_POOL_ID: {process.env.NEXT_PUBLIC_USER_POOL_ID}</p>
        <p>USER_POOL_CLIENT_ID: {process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID} </p>
      {step === "signUp" ? (
        <>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={handleSignUp} disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </>
      ) : (
        <>
          <input
            placeholder="Confirmation Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button onClick={handleConfirm} disabled={loading}>
            {loading ? "Confirming..." : "Confirm Sign Up"}
          </button>
        </>
      )}
      {error ? <div style={{ color: "red" }}>{error}</div> : null}
    </div>
  );
}