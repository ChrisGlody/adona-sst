"use client";
import { useEffect, useState } from "react";
import Header from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useParams } from "next/navigation";

export default function WorkflowRunsPage() {
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
        // Prefer workflow-level schema; else derive from single start node or single node
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

  async function startRun() {
    setStarting(true);
    setSubmitError(null);
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
    const res = await fetch("/api/workflows/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId, input }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(
        (data && (data.error || data.message)) || "Failed to start run"
      );
      setStarting(false);
      return;
    }
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
        <Card className="p-4 space-y-3">
          <div className="font-medium">Workflow Input</div>
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
            <Button onClick={startRun} disabled={starting}>
              {starting ? "Starting..." : "Start Run"}
            </Button>
          </div>
        </Card>
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
