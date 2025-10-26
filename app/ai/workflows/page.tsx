"use client";
import { useEffect, useState } from "react";
import Header from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  inputSchema: any;
  outputSchema: any;
  definition: any;
  createdAt: string;
  updatedAt: string;
}

export default function AIWorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try {
      const res = await fetch("/api/ai/workflows/list");
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch (error) {
      console.error("Failed to load workflows:", error);
    } finally {
      setLoading(false);
    }
  }

  async function testWorkflow(workflowId: string) {
    try {
      const testInput = { test: "Hello from AI workflow test" };

      // Initialize workflow run
      const runRes = await fetch("/api/ai/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, input: testInput }),
      });

      if (!runRes.ok) {
        const error = await runRes.json();
        alert(`Failed to start workflow: ${error.error}`);
        return;
      }

      const { runId, nextSteps } = await runRes.json();
      console.log("Workflow run started:", { runId, nextSteps });

      // Execute steps automatically for testing
      let currentSteps = nextSteps;
      const stepOutputs: Record<string, any> = {};

      while (currentSteps.length > 0) {
        for (const step of currentSteps) {
          try {
            const executeRes = await fetch(
              `/api/ai/workflows/${runId}/step/${step.stepId}/execute`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: testInput }),
              }
            );

            if (!executeRes.ok) {
              const error = await executeRes.json();
              throw new Error(`Step execution failed: ${error.error}`);
            }

            const {
              output,
              nextSteps: newSteps,
              isComplete,
            } = await executeRes.json();
            stepOutputs[step.stepId] = output;
            currentSteps = newSteps || [];

            if (isComplete) {
              console.log("Workflow completed:", stepOutputs);
              alert(
                `Workflow completed successfully! Output: ${JSON.stringify(
                  stepOutputs,
                  null,
                  2
                )}`
              );
              return;
            }
          } catch (error: any) {
            console.error(`Step ${step.stepId} failed:`, error);
            alert(`Step ${step.name} failed: ${error.message}`);
            return;
          }
        }
      }
    } catch (error: any) {
      console.error("Workflow test failed:", error);
      alert(`Workflow test failed: ${error.message}`);
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="p-6">
          <div className="text-center">Loading AI workflows...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">AI Workflows</h1>
          <Link href="/workflows">
            <Button variant="outline">Back to All Workflows</Button>
          </Link>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          These workflows are designed for AI agent execution. The AI agent can
          discover and execute them step by step.
        </div>

        {workflows.length === 0 ? (
          <Card className="p-6 text-center">
            <div className="text-muted-foreground">
              No AI workflows found. Create workflows with "Database
              (AI-driven)" execution environment.
            </div>
            <Link href="/workflows">
              <Button className="mt-4">Create Workflow</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{workflow.name}</h3>
                    {workflow.description && (
                      <p className="text-muted-foreground mt-1">
                        {workflow.description}
                      </p>
                    )}
                    <div className="mt-2 text-sm text-muted-foreground">
                      <div>
                        Steps: {workflow.definition?.nodes?.length || 0}
                      </div>
                      <div>
                        Created:{" "}
                        {new Date(workflow.createdAt).toLocaleDateString()}
                      </div>
                      <div>
                        Updated:{" "}
                        {new Date(workflow.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Link href={`/workflows/${workflow.id}/edit`}>
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/ai/workflows/${workflow.id}/runs`}>
                      <Button variant="outline" size="sm">
                        View Runs
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testWorkflow(workflow.id)}
                    >
                      Test Run
                    </Button>
                  </div>
                </div>

                {/* Workflow Definition Preview */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Workflow Definition
                  </summary>
                  <div className="mt-2 p-3 bg-gray-50 rounded text-xs">
                    <pre>{JSON.stringify(workflow.definition, null, 2)}</pre>
                  </div>
                </details>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
