"use client";

import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { testDeterminism } from "./actions";
import type { DeterminismTestResult } from "./actions";

export default function DeterministicInferencePage() {
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("8000");
  const [prompt, setPrompt] = useState("");
  const [numTests, setNumTests] = useState("2");
  const [temperature, setTemperature] = useState("0.0");
  const [topP, setTopP] = useState("1.0");
  const [topK, setTopK] = useState("0");
  const [seed, setSeed] = useState("42");
  const [outputs, setOutputs] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleTestDeterminism = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    if (!host.trim() || !port.trim()) {
      setError("Please fill in both Host and Port");
      return;
    }

    const numTestsValue = parseInt(numTests);
    if (isNaN(numTestsValue) || numTestsValue < 1 || numTestsValue > 100) {
      setError("Number of tests must be between 1 and 100");
      return;
    }

    setTesting(true);
    setOutputs([]);
    setSummary("");
    setError(null);

    try {
      const result: DeterminismTestResult = await testDeterminism({
        host,
        port,
        prompt,
        numTests: numTestsValue,
        temperature: parseFloat(temperature) || 0.0,
        topP: parseFloat(topP) || 1.0,
        topK: parseInt(topK) || 0,
        seed: parseInt(seed) || 42,
      });

      if (result.error) {
        setError(result.error);
        setSummary("❌ Error while generating outputs.");
      } else {
        setOutputs(result.outputs);
        setSummary(
          result.deterministic
            ? "✅ Deterministic: All outputs are identical."
            : "⚠️ Non-deterministic: Outputs differ."
        );
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setSummary("❌ Error while generating outputs.");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  const endpointUrl =
    host.trim() && port.trim()
      ? `${
          host.startsWith("http://") || host.startsWith("https://")
            ? `${host}:${port}`
            : `http://${host}:${port}`
        }/generate`
      : "Enter host and port";

  return (
    <>
      <Header />
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Determinism Tester</h1>
          <p className="text-muted-foreground">
            Test deterministic inference by running multiple tests with the same
            parameters
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Configure the API endpoint and test parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="host"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Host
                </label>
                <Input
                  id="host"
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="localhost"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="port"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Port
                </label>
                <Input
                  id="port"
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="8000"
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">
                Endpoint URL:
              </p>
              <p className="text-sm font-mono">{endpointUrl}</p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="prompt"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Prompt
              </label>
              <Textarea
                id="prompt"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter prompt here..."
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">Test Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="numTests"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Number of Tests
                  </label>
                  <Input
                    id="numTests"
                    type="number"
                    min="1"
                    max="1000"
                    value={numTests}
                    onChange={(e) => setNumTests(e.target.value)}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="seed"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Seed
                  </label>
                  <Input
                    id="seed"
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="42"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">Sampling Parameters</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="temperature"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Temperature
                  </label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    min="0"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="0.0"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="topP"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Top P
                  </label>
                  <Input
                    id="topP"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={topP}
                    onChange={(e) => setTopP(e.target.value)}
                    placeholder="1.0"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="topK"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Top K
                  </label>
                  <Input
                    id="topK"
                    type="number"
                    min="0"
                    value={topK}
                    onChange={(e) => setTopK(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
                {error}
              </div>
            )}

            <Button
              onClick={handleTestDeterminism}
              disabled={testing}
              className="w-full"
            >
              {testing
                ? `Testing... (${outputs.length}/${numTests})`
                : `Run ${numTests} Tests`}
            </Button>
          </CardContent>
        </Card>

        {testing && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            </CardContent>
          </Card>
        )}

        {summary && (
          <Card>
            <CardContent className="pt-6">
              <p
                className={`text-lg font-medium ${
                  summary.includes("✅")
                    ? "text-green-600 dark:text-green-400"
                    : summary.includes("⚠️")
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {summary}
              </p>
            </CardContent>
          </Card>
        )}

        {outputs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Outputs ({outputs.length} results)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {outputs.map((o, idx) => (
                  <div key={idx} className="border rounded-md p-3 bg-muted/50">
                    <div className="text-sm font-medium mb-1">
                      Output #{idx + 1}:
                    </div>
                    <pre className="text-sm font-mono bg-background p-2 rounded border whitespace-pre-wrap break-words">
                      {o}
                    </pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
