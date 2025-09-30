"use client";

import { useEffect } from "react";
import { signOut } from "aws-amplify/auth";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await signOut();
      } catch {
        // ignore
      } finally {
        router.replace("/");
      }
    })();
  }, [router]);

  return null;
}

("use client");

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "aws-amplify/auth";
import { configureAmplifyClient } from "@/lib/amplify";

export default function LogoutPage() {
  configureAmplifyClient();

  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        await signOut();
        router.replace("/login");
      } catch (err: any) {
        setError(err?.message ?? "Failed to sign out");
      }
    }
    void run();
  }, [router]);

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Signing out...</h1>
      {error ? (
        <p className="text-red-600 text-sm" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-sm text-gray-600">Please wait.</p>
      )}
    </div>
  );
}
