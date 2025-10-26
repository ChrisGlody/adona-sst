"use client";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useParams } from "next/navigation";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";

export default function AIWorkflowRunsPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params?.id as string;
  const [runId, setRunId] = useState<string | null>(null);
  const [runData, setRunData] = useState<any | null>(null);
  const [starting, setStarting] = useState(false);
  const [workflow, setWorkflow] = useState<any | null>(null);
  const [schema, setSchema] = useState<any | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [rawJson, setRawJson] = useState<string>("{}");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<string[]>([]);

  // Fetch workflow to get input schema
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!workflowId) return;
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setWorkflow(data);

        // Get workflow-level schema
        const def = data?.definition || {};
        let wfSchema = def?.inputSchema || null;
        if (!wfSchema) {
          const nodes: any[] = Array.isArray(def?.nodes) ? def.nodes : [];
          const edges: any[] = Array.isArray(def?.edges) ? def.edges : [];
          const targets = new Set(edges.map((e: any) => e.target));
          const startNodes = nodes.filter((n: any) => !targets.has(n.id));
          const candidate =
            startNodes.length === 1
              ? startNodes[0]
              : nodes.length === 1
              ? nodes[0]
              : null;
          if (candidate?.inputSchema) wfSchema = candidate.inputSchema;
        }
        setSchema(wfSchema);

        // Initialize defaults from schema
        if (wfSchema?.type === "object" && wfSchema?.properties) {
          const initial: Record<string, any> = {};
          for (const [key, prop] of Object.entries(
            wfSchema.properties as any
          )) {
            if ((prop as any)?.default !== undefined)
              initial[key] = (prop as any).default;
            else if ((prop as any)?.type === "number") initial[key] = 0;
            else if ((prop as any)?.type === "boolean") initial[key] = false;
            else initial[key] = "";
          }
          setFormValues(initial);
          setRawJson(JSON.stringify(initial, null, 2));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [workflowId]);

  function renderField(key: string, prop: any) {
    const isRequired = schema?.required?.includes(key);
    const label = (
      <div className="text-sm font-medium">
        {key}
        {isRequired ? <span className="text-red-500">*</span> : null}
      </div>
    );
    const help = prop?.description ? (
      <div className="text-xs text-muted-foreground">{prop.description}</div>
    ) : null;

    if (prop?.type === "number") {
      return (
        <div key={key} className="space-y-1">
          {label}
          <Input
            type="number"
            value={formValues[key] ?? ""}
            onChange={(e) =>
              setFormValues((v) => ({ ...v, [key]: Number(e.target.value) }))
            }
          />
          {help}
        </div>
      );
    }
    if (prop?.type === "boolean") {
      return (
        <div key={key} className="space-y-1">
          {label}
          <select
            className="border rounded px-2 py-1 h-9"
            value={String(formValues[key] ?? false)}
            onChange={(e) =>
              setFormValues((v) => ({ ...v, [key]: e.target.value === "true" }))
            }
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
          {help}
        </div>
      );
    }
    if (prop?.type === "object") {
      return (
        <div key={key} className="space-y-1">
          {label}
          <Textarea
            value={
              typeof formValues[key] === "string"
                ? formValues[key]
                : JSON.stringify(formValues[key] ?? {}, null, 2)
            }
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value || "{}");
                setFormValues((v) => ({ ...v, [key]: parsed }));
              } catch {
                setFormValues((v) => ({ ...v, [key]: e.target.value }));
              }
            }}
            className="font-mono"
            rows={6}
          />
          {help}
        </div>
      );
    }
    // string or any
    return (
      <div key={key} className="space-y-1">
        {label}
        <Input
          value={formValues[key] ?? ""}
          onChange={(e) =>
            setFormValues((v) => ({ ...v, [key]: e.target.value }))
          }
        />
        {help}
      </div>
    );
  }

  async function startAIRun() {
    setStarting(true);
    setSubmitError(null);
    setExecutionLog([]);
    let input: any = formValues;
    if (!schema) {
      try {
        input = rawJson ? JSON.parse(rawJson) : {};
      } catch (e) {
        setStarting(false);
        setSubmitError("Invalid JSON input");
        return;
      }
    }

    try {
      // Use the AI workflow auto-execution endpoint
      const res = await fetch("/api/ai/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, input }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(
          (data && (data.error || data.message)) ||
            "Failed to start AI workflow run"
        );
        setStarting(false);
        return;
      }

      setRunId(data.runId);
      setExecutionLog((prev) => [
        ...prev,
        `AI Workflow started with runId: ${data.runId}`,
      ]);

      // Execute workflow automatically using the new AI tools
      await executeAIWorkflow(data.runId, input);
    } catch (error: any) {
      setSubmitError(`Failed to start AI workflow: ${error.message}`);
      setStarting(false);
    }
  }

  async function executeAIWorkflow(runId: string, input: any) {
    try {
      // Execute steps automatically
      let currentSteps = await getNextExecutableSteps(runId);
      const stepOutputs: Record<string, any> = {};
      let stepCount = 0;

      while (currentSteps.length > 0 && stepCount < 50) {
        for (const step of currentSteps) {
          try {
            setExecutionLog((prev) => [
              ...prev,
              `Executing step ${stepCount + 1}: ${step.name}`,
            ]);

            const executeRes = await fetch(
              `/api/ai/workflows/${runId}/step/${step.stepId}/execute`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input }),
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
            stepCount++;

            setExecutionLog((prev) => [
              ...prev,
              `Step ${stepCount} completed: ${step.name}`,
              `Output: ${JSON.stringify(output, null, 2)}`,
            ]);

            // Force a status update to refresh the visual state
            await refreshRunStatus(runId);

            if (isComplete) {
              setExecutionLog((prev) => [
                ...prev,
                `Workflow completed successfully!`,
              ]);
              setStarting(false);
              return;
            }

            currentSteps = newSteps || [];

            // Small delay to make visual updates more visible
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error: any) {
            setExecutionLog((prev) => [
              ...prev,
              `Step ${step.name} failed: ${error.message}`,
            ]);
            setStarting(false);
            return;
          }
        }
      }

      setStarting(false);
    } catch (error: any) {
      setExecutionLog((prev) => [
        ...prev,
        `Workflow execution failed: ${error.message}`,
      ]);
      setStarting(false);
    }
  }

  async function refreshRunStatus(runId: string) {
    try {
      const res = await fetch(`/api/ai/workflows/${runId}/status`);
      if (res.ok) {
        const data = await res.json();
        setRunData(data);
      }
    } catch (error) {
      console.error("Failed to refresh run status:", error);
    }
  }

  async function getNextExecutableSteps(runId: string) {
    try {
      const statusRes = await fetch(`/api/ai/workflows/${runId}/status`);
      const statusData = await statusRes.json();
      return statusData.nextSteps || [];
    } catch {
      return [];
    }
  }

  useEffect(() => {
    if (!runId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/ai/workflows/${runId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setRunData(data);

      // Stop polling if workflow is complete
      if (data.run?.status === "completed" || data.run?.status === "failed") {
        clearInterval(t);
      }
    }, 1500);
    return () => clearInterval(t);
  }, [runId]);

  const statusByStepId = useMemo(() => {
    const map: Record<string, string> = {};
    const steps: any[] = (runData?.steps as any[]) || [];
    for (const s of steps) map[s.stepId] = s.status;
    return map;
  }, [runData]);

  const flowNodes = useMemo(() => {
    const def = workflow?.definition || {};
    const nodes: any[] = Array.isArray(def.nodes) ? def.nodes : [];
    return nodes.map((n: any) => {
      const status = statusByStepId[n.id] || "pending";
      const color =
        status === "completed"
          ? "#22c55e" // green
          : status === "running"
          ? "#f59e0b" // amber
          : status === "queued"
          ? "#3b82f6" // blue
          : status === "failed"
          ? "#ef4444" // red
          : status === "cancelled"
          ? "#6b7280" // gray
          : "#9ca3af"; // pending gray
      return {
        id: n.id,
        data: { label: `${n.name || n.id} (${status})` },
        position: { x: n.x || 0, y: n.y || 0 },
        style: {
          backgroundColor: color + "20",
          border: `2px solid ${color}`,
          color: "#111827",
        },
      };
    });
  }, [workflow, statusByStepId]);

  const flowEdges = useMemo(() => {
    const def = workflow?.definition || {};
    const edges: any[] = Array.isArray(def.edges) ? def.edges : [];
    return edges.map((e: any) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
  }, [workflow]);

  return (
    <>
      <Header />
      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">AI Workflow Execution</h1>
          <div className="text-sm text-muted-foreground">
            {workflow?.name || "Loading..."}
          </div>
        </div>

        <Card className="p-4 space-y-3">
          <div className="font-medium">AI Workflow Input</div>
          {schema?.type === "object" && schema?.properties ? (
            <div className="grid gap-3">
              {Object.entries(schema.properties).map(
                ([key, prop]: [string, any]) => renderField(key, prop)
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Enter JSON input (no schema defined)
              </div>
              <Textarea
                className="font-mono"
                rows={8}
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
              />
            </div>
          )}
          {submitError && (
            <div className="text-sm text-red-600">{submitError}</div>
          )}
          <div>
            <Button onClick={startAIRun} disabled={starting}>
              {starting ? "AI Executing..." : "Start AI Workflow"}
            </Button>
          </div>
        </Card>

        {runId && (
          <div className="text-sm text-muted-foreground">AI Run: {runId}</div>
        )}

        {/* Execution Log */}
        {executionLog.length > 0 && (
          <Card className="p-4">
            <div className="font-medium mb-2">AI Execution Log</div>
            <div className="bg-gray-50 p-3 rounded max-h-40 overflow-y-auto">
              {executionLog.map((log, index) => (
                <div key={index} className="text-xs font-mono mb-1">
                  {log}
                </div>
              ))}
            </div>
          </Card>
        )}

        {runData && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-7">
              <Card className="h-[60vh]">
                <ReactFlow nodes={flowNodes} edges={flowEdges} fitView>
                  <MiniMap />
                  <Controls />
                  <Background />
                </ReactFlow>
              </Card>
            </div>
            <div className="col-span-5">
              <Card className="p-4 h-[60vh] overflow-auto">
                <div className="font-medium">
                  AI Run Status: {runData.run?.status}
                  {starting && (
                    <span className="ml-2 text-sm text-blue-600">
                      (Executing...)
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Steps: {runData.steps?.length || 0} | Completed:{" "}
                  {runData.steps?.filter((s: any) => s.status === "completed")
                    .length || 0}
                </div>

                {/* Step Status Summary */}
                {runData.steps && runData.steps.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-sm font-medium">Step Status:</div>
                    {runData.steps.map((step: any) => (
                      <div
                        key={step.stepId}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            step.status === "completed"
                              ? "bg-green-500"
                              : step.status === "running"
                              ? "bg-yellow-500"
                              : step.status === "failed"
                              ? "bg-red-500"
                              : step.status === "queued"
                              ? "bg-blue-500"
                              : "bg-gray-400"
                          }`}
                        />
                        <span className="font-mono">
                          {step.name || step.stepId}
                        </span>
                        <span className="text-muted-foreground">
                          ({step.status})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Raw Data
                  </summary>
                  <pre className="mt-2 text-xs bg-muted p-3 rounded">
                    {JSON.stringify(runData, null, 2)}
                  </pre>
                </details>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
