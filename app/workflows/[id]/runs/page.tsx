"use client";
import { useEffect, useState } from "react";
import Header from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";

export default function WorkflowRunsPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params?.id as string;
  const [runId, setRunId] = useState<string | null>(null);
  const [runData, setRunData] = useState<any | null>(null);
  const [starting, setStarting] = useState(false);

  async function startRun() {
    setStarting(true);
    const res = await fetch("/api/workflows/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId, input: {} }),
    });
    const data = await res.json();
    setRunId(data.runId);
    setStarting(false);
  }

  useEffect(() => {
    if (!runId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/workflows/runs/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRunData(data);
    }, 1500);
    return () => clearInterval(t);
  }, [runId]);

  return (
    <>
      <Header />
      <div className="p-6 space-y-4">
        <Button onClick={startRun} disabled={starting}>
          {starting ? "Starting..." : "Start Run"}
        </Button>
        {runId && (
          <div className="text-sm text-muted-foreground">Run: {runId}</div>
        )}
        {runData && (
          <Card className="p-4">
            <div className="font-medium">Status: {runData.run.status}</div>
            <pre className="mt-2 text-xs bg-muted p-3 rounded">
              {JSON.stringify(runData, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </>
  );
}



