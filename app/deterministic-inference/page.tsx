"use client";

import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function DeterministicInferencePage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await fetchAuthSession();
        await getCurrentUser();
        if (!mounted) return;
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

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <>
      <Header />
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <CardHeader className="text-center space-y-4">
            <div className="text-6xl">🎯</div>
            <CardTitle className="text-3xl">Deterministic Inference</CardTitle>
            <CardDescription className="text-lg">
              Reproducible and deterministic AI inference results
            </CardDescription>
            <div className="pt-4">
              <p className="text-muted-foreground">Coming Soon</p>
            </div>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}

