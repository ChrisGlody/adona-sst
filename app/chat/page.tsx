"use client";

import { getCurrentUser, fetchAuthSession, signOut } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { getIdToken } from "@/lib/auth";

interface Tool {
  id: string;
  name: string;
  description: string;
  type: string;
  inputSchema: any;
  outputSchema: any;
  implementation: string;
  lambdaArn?: string;
  owner?: string;
  createdAt: string;
}

export default function ChatPage() {
  const [loading, setLoading] = useState(true);
  const [registeringTool, setRegisteringTool] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [toolInputs, setToolInputs] = useState<Record<string, any>>({});
  const [toolDefinition, setToolDefinition] = useState(`{
  "name": "multiply_numbers",
  "description": "Multiplies two numbers together and returns the product.",
  "type": "s3-inline",
  "inputSchema": {
    "type": "object",
    "properties": {
      "x": { "type": "number" },
      "y": { "type": "number" }
    },
    "required": ["x", "y"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "result": { "type": "number" }
    }
  },
  "code": "export async function main({ x, y }) { return { result: x * y }; }"
}`);
  const [fetchingTools, setFetchingTools] = useState(false);
  const router = useRouter();

  const fetchTools = async () => {
    setFetchingTools(true);
    try {
      const res = await fetch("/api/tools/list");
      const data = await res.json();
      if (data.tools) {
        setTools(data.tools);
      }
    } catch (error) {
      console.error("Error fetching tools:", error);
    } finally {
      setFetchingTools(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await fetchAuthSession();
        const user = await getCurrentUser();
        if (!mounted) return;
        setUsername(user.username ?? "");
        await fetchTools();
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
      const toolData = JSON.parse(toolDefinition);
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toolData),
      });
      const result = await res.json();
      console.log("Tool registered:", result);
      await fetchTools(); // Refresh tools list
    } catch (err) {
      console.error("Error registering tool:", err);
    } finally {
      setRegisteringTool(false);
    }
  }

  async function handleRunTool() {
    if (!selectedTool) return;

    setRunningTool(true);
    try {
      const res = await fetch("/api/tools/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toolId: selectedTool.id,
          input: toolInputs,
        }),
      });

      const data = await res.json();
      console.log("Tool result:", data);
    } catch (err) {
      console.error("Error running tool:", err);
    } finally {
      setRunningTool(false);
    }
  }

  const handleToolSelect = (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    setSelectedTool(tool || null);
    setToolInputs({});
  };

  const handleInputChange = (key: string, value: any) => {
    setToolInputs((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const renderInputField = (key: string, schema: any) => {
    const isRequired = selectedTool?.inputSchema?.required?.includes(key);

    if (schema.type === "number") {
      return (
        <div key={key} className="space-y-1">
          <label className="text-sm font-medium">
            {key} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <Input
            type="number"
            value={toolInputs[key] || ""}
            onChange={(e) =>
              handleInputChange(key, parseFloat(e.target.value) || 0)
            }
            placeholder={`Enter ${key}`}
          />
        </div>
      );
    }

    if (schema.type === "string") {
      return (
        <div key={key} className="space-y-1">
          <label className="text-sm font-medium">
            {key} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <Input
            type="text"
            value={toolInputs[key] || ""}
            onChange={(e) => handleInputChange(key, e.target.value)}
            placeholder={`Enter ${key}`}
          />
        </div>
      );
    }

    return (
      <div key={key} className="space-y-1">
        <label className="text-sm font-medium">
          {key} {isRequired && <span className="text-red-500">*</span>}
        </label>
        <Input
          type="text"
          value={toolInputs[key] || ""}
          onChange={(e) => handleInputChange(key, e.target.value)}
          placeholder={`Enter ${key}`}
        />
      </div>
    );
  };

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="p-6 space-y-6">
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

      <div className="rounded-lg border p-4">Chat goes here.</div>

      {/* Tool Registration Section */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Register New Tool</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Tool Definition (JSON)
            </label>
            <textarea
              className="w-full h-40 p-3 border rounded-md font-mono text-sm"
              value={toolDefinition}
              onChange={(e) => setToolDefinition(e.target.value)}
              placeholder="Paste your tool definition JSON here..."
            />
          </div>
          <Button
            onClick={handleRegisterTool}
            disabled={registeringTool}
            className="w-full"
          >
            {registeringTool ? "Registering tool..." : "Register Tool"}
          </Button>
        </div>
      </Card>

      {/* Tool Selection and Running Section */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Run Tool</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Select Tool
            </label>
            <select
              className="w-full p-2 border rounded-md"
              value={selectedTool?.id || ""}
              onChange={(e) => handleToolSelect(e.target.value)}
              disabled={fetchingTools}
            >
              <option value="">Choose a tool...</option>
              {tools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name} - {tool.description}
                </option>
              ))}
            </select>
          </div>

          {selectedTool && (
            <div className="space-y-3">
              <h4 className="font-medium">Input Parameters</h4>
              <div className="grid gap-3">
                {selectedTool.inputSchema?.properties &&
                  Object.entries(selectedTool.inputSchema.properties).map(
                    ([key, schema]: [string, any]) =>
                      renderInputField(key, schema)
                  )}
              </div>
            </div>
          )}

          <Button
            onClick={handleRunTool}
            disabled={runningTool || !selectedTool}
            className="w-full"
          >
            {runningTool ? "Running tool..." : "Run Tool"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
