"use client";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from "reactflow";
import "reactflow/dist/style.css";
import Editor from "@monaco-editor/react";
import Form from "@rjsf/core";
import { withTheme } from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { useParams } from "next/navigation";

const ThemedForm = withTheme({ templates: {} as any } as any);

export default function EditWorkflowPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [wf, setWf] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [tools, setTools] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setWf(data);
      setNodes(
        (data.definition?.nodes || []).map((n: any) => ({
          id: n.id,
          data: { label: n.name || n.id },
          position: { x: n.x || 0, y: n.y || 0 },
        }))
      );
      setEdges(
        (data.definition?.edges || []).map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        }))
      );
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/tools/list");
        const data = await res.json();
        setTools(data.tools || []);
      } catch {}
    })();
  }, []);

  const onConnect = (connection: any) =>
    setEdges((eds) => addEdge(connection, eds));
  const onNodesChange = (changes: any) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  };
  const onEdgesChange = (changes: any) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  };

  const currentNodeDef = useMemo(() => {
    if (!selectedNode || !wf) return null;
    return (
      (wf.definition?.nodes || []).find((n: any) => n.id === selectedNode.id) ||
      null
    );
  }, [selectedNode, wf]);

  function updateNodeDef(patch: any) {
    if (!wf || !currentNodeDef) return;
    const def = { ...(wf.definition || { nodes: [], edges: [] }) };
    def.nodes = def.nodes.map((n: any) =>
      n.id === currentNodeDef.id ? { ...n, ...patch } : n
    );
    setWf({ ...wf, definition: def });
    // sync label in canvas when name changes
    if (patch.name) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === currentNodeDef.id
            ? { ...n, data: { ...n.data, label: patch.name } }
            : n
        )
      );
    }
  }

  async function save() {
    setSaving(true);
    const definition = {
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.data?.label,
        x: n.position.x,
        y: n.position.y,
        ...(wf?.definition?.nodes?.find((d: any) => d.id === n.id) || {}),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(wf?.definition?.edges?.find((d: any) => d.id === e.id) || {}),
      })),
    };
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: wf?.name || "Workflow", definition }),
    });
    setSaving(false);
    if (!res.ok) alert("Save failed");
  }

  function addNode(type: string) {
    const newId = `n_${Math.random().toString(36).slice(2, 8)}`;
    setNodes((nds) =>
      nds.concat({
        id: newId,
        data: { label: `${type} ${newId}` },
        position: { x: 100, y: 100 },
      })
    );
    const def = { ...(wf?.definition || { nodes: [], edges: [] }) };
    def.nodes = [
      ...(def.nodes || []),
      { id: newId, name: `${type} ${newId}`, type },
    ];
    setWf({ ...(wf || {}), definition: def });
  }

  function deleteSelectedNode() {
    if (!selectedNode || !wf) return;
    const nodeId = (selectedNode as any).id as string;
    // remove from canvas
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
    );
    // remove from definition
    const def = { ...(wf.definition || { nodes: [], edges: [] }) };
    def.nodes = (def.nodes || []).filter((n: any) => n.id !== nodeId);
    def.edges = (def.edges || []).filter(
      (e: any) => e.source !== nodeId && e.target !== nodeId
    );
    setWf({ ...wf, definition: def });
    setSelectedNode(null);
  }

  return (
    <>
      <Header />
      <div className="p-6 grid grid-cols-12 gap-4 h-[calc(100vh-4rem)]">
        <div className="col-span-9 h-full">
          <Card className="h-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange as any}
              onEdgesChange={onEdgesChange as any}
              onConnect={onConnect as any}
              onNodeClick={(_, n) => setSelectedNode(n as any)}
              fitView
            >
              <MiniMap />
              <Controls />
              <Background />
            </ReactFlow>
          </Card>
        </div>
        <div className="col-span-3 space-y-3">
          <Card className="p-3 space-y-2">
            <div className="font-medium">Palette</div>
            <Button onClick={() => addNode("tool")}>Add Tool</Button>
            <Button onClick={() => addNode("inline")}>Add Inline</Button>
            <Button onClick={() => addNode("http")}>Add HTTP</Button>
            <Button variant="secondary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </Card>

          <Card className="p-3 space-y-3">
            <div className="font-medium">Inspector</div>
            {currentNodeDef ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {currentNodeDef.id}
                </div>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={deleteSelectedNode}>
                    Delete Step
                  </Button>
                </div>
                {/* Name */}
                <label className="text-sm font-medium">Step Name</label>
                <input
                  className="w-full p-2 border rounded"
                  value={currentNodeDef.name || ""}
                  onChange={(e) => updateNodeDef({ name: e.target.value })}
                  placeholder="Step name"
                />
                {/* Type */}
                <label className="text-sm font-medium">Type</label>
                <select
                  className="w-full p-2 border rounded"
                  value={currentNodeDef.type || "tool"}
                  onChange={(e) => updateNodeDef({ type: e.target.value })}
                >
                  <option value="tool">Tool</option>
                  <option value="inline">Inline</option>
                  <option value="http">HTTP</option>
                </select>

                {/* Tool selection */}
                {currentNodeDef.type === "tool" && (
                  <div>
                    <label className="text-sm font-medium">Tool</label>
                    <select
                      className="w-full p-2 border rounded"
                      value={currentNodeDef.toolId || ""}
                      onChange={(e) =>
                        updateNodeDef({ toolId: e.target.value })
                      }
                    >
                      <option value="">Choose a tool…</option>
                      {tools.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.description}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const tool = tools.find(
                        (t) => t.id === currentNodeDef.toolId
                      );
                      return tool ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Input schema fields:{" "}
                          {Object.keys(tool.inputSchema?.properties || {}).join(
                            ", "
                          ) || "(none)"}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* HTTP URL */}
                {currentNodeDef.type === "http" && (
                  <div>
                    <label className="text-sm font-medium">URL</label>
                    <input
                      className="w-full p-2 border rounded"
                      value={currentNodeDef.url || ""}
                      onChange={(e) => updateNodeDef({ url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                )}

                {/* Inline implRef */}
                {currentNodeDef.type === "inline" && (
                  <div>
                    <label className="text-sm font-medium">
                      Code (main(input, context))
                    </label>
                    <Editor
                      height="200px"
                      defaultLanguage="typescript"
                      value={
                        currentNodeDef.code ||
                        "export async function main(input, context){return input;}"
                      }
                      onChange={(v) => updateNodeDef({ code: v })}
                    />
                  </div>
                )}

                {/* inputMapping */}
                <div>
                  <label className="text-sm font-medium">
                    Input Mapping (JS expression)
                  </label>
                  <Editor
                    height="120px"
                    defaultLanguage="javascript"
                    value={currentNodeDef.inputMapping || "({})"}
                    onChange={(v) => updateNodeDef({ inputMapping: v })}
                  />
                </div>

                {/* Schemas */}
                <SchemaEditor
                  title="Input Schema"
                  schema={
                    currentNodeDef.inputSchema || {
                      type: "object",
                      properties: {},
                      required: [],
                    }
                  }
                  onChange={(s) => updateNodeDef({ inputSchema: s })}
                />
                <SchemaEditor
                  title="Output Schema"
                  schema={
                    currentNodeDef.outputSchema || {
                      type: "object",
                      properties: {},
                      required: [],
                    }
                  }
                  onChange={(s) => updateNodeDef({ outputSchema: s })}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Select a node to edit
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function SchemaEditor({
  title,
  schema,
  onChange,
}: {
  title: string;
  schema: any;
  onChange: (s: any) => void;
}) {
  const s = schema || { type: "object", properties: {}, required: [] };
  const properties = s.properties || {};
  const required: string[] = Array.isArray(s.required) ? s.required : [];

  function updateProp(name: string, patch: any) {
    const next = {
      ...s,
      properties: {
        ...properties,
        [name]: { ...(properties[name] || {}), ...patch },
      },
    };
    onChange(next);
  }
  function renameProp(oldName: string, newName: string) {
    if (!newName || oldName === newName) return;
    const entries = Object.entries(properties).map(([k, v]) => [
      k === oldName ? newName : k,
      v,
    ]);
    const nextProps = Object.fromEntries(entries);
    const nextReq = required.map((r) => (r === oldName ? newName : r));
    onChange({ ...s, properties: nextProps, required: nextReq });
  }
  function toggleRequired(name: string) {
    const isReq = required.includes(name);
    const nextReq = isReq
      ? required.filter((r) => r !== name)
      : [...required, name];
    onChange({ ...s, required: nextReq });
  }
  function addProp() {
    const base = "field";
    let i = 1;
    let name = `${base}${i}`;
    while (properties[name]) {
      i += 1;
      name = `${base}${i}`;
    }
    onChange({
      ...s,
      properties: { ...properties, [name]: { type: "string" } },
    });
  }
  function removeProp(name: string) {
    const { [name]: _, ...rest } = properties;
    onChange({
      ...s,
      properties: rest,
      required: required.filter((r) => r !== name),
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{title}</label>
        <button className="text-xs underline" onClick={addProp} type="button">
          Add property
        </button>
      </div>
      <div className="space-y-2">
        {Object.keys(properties).length === 0 && (
          <div className="text-xs text-muted-foreground">No properties</div>
        )}
        {Object.entries(properties).map(([name, prop]: any) => (
          <div key={name} className="border rounded p-2 space-y-2">
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 p-1 border rounded text-sm"
                value={name}
                onChange={(e) => renameProp(name, e.target.value)}
              />
              <select
                className="p-1 border rounded text-sm"
                value={prop.type || "string"}
                onChange={(e) => updateProp(name, { type: e.target.value })}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
                <option value="array">array</option>
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={required.includes(name)}
                  onChange={() => toggleRequired(name)}
                />
                required
              </label>
              <button
                className="text-xs text-red-600"
                onClick={() => removeProp(name)}
                type="button"
              >
                remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
