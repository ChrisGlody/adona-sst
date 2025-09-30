"use client";

import { getCurrentUser, fetchAuthSession, signOut } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getIdToken } from "@/lib/auth";


export default function ChatPage() {
  const [loading, setLoading] = useState(true);
  const [registeringTool, setRegisteringTool] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await fetchAuthSession();
        const user = await getCurrentUser();
        if (!mounted) return;
        setUsername(user.username ?? "");
      } catch {
        router.replace("/login");
        return;
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleTokenRefresh() {
    const token = await getIdToken();
    if (!token) {
      // not signed in
      return;
    }
    const res = await fetch("/api/secure", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    console.log(data);
  }

  async function handleRegisterTool() {
    setRegisteringTool(true);
    try {
    const res = await fetch("/api/tools", {
      method: "POST",
    });
    setRegisteringTool(false);
    } catch (err) {
      console.error(err);
      setRegisteringTool(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Signed in as {username}
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          Logout
        </Button>
      </div>
      <div  className="rounded-lg border p-4">Chat goes here.</div>
      <Button onClick={handleRegisterTool} disabled={registeringTool}>{registeringTool ? "Registering tool..." : "Register Tool"}</Button>
      <div>
        {process.env.DATABASE_URL}
        {process.env.OPENAI_API_KEY}
        {process.env.QDRANT_URL}
        {process.env.QDRANT_API_KEY}
      </div>
    </div>
  );
}
