"use client";
import { useEffect, useState } from "react";
import Header from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const router = useRouter();

  async function fetchList() {
    const res = await fetch("/api/workflows/list");
    const data = await res.json();
    setWorkflows(data.workflows || []);
  }

  useEffect(() => {
    fetchList();
  }, []);

  async function handleCreate() {
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name || "New Workflow",
        definition: { nodes: [], edges: [] },
      }),
    });
    const data = await res.json();
    if (data?.id) router.push(`/workflows/${data.id}/edit`);
  }

  return (
    <>
      <Header />
      <div className="p-6 space-y-6">
        <Card className="p-4 flex gap-2 items-center">
          <Input
            placeholder="Workflow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={handleCreate}>Create</Button>
        </Card>

        <div className="grid gap-3">
          {workflows.map((w) => (
            <Card key={w.id} className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">{w.name}</div>
                <div className="text-sm text-muted-foreground">
                  {w.description}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => router.push(`/workflows/${w.id}/edit`)}>
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/workflows/${w.id}/runs`)}
                >
                  Runs
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}



