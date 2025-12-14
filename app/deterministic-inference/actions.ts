"use server";

export interface DeterminismTestParams {
  host: string;
  port: string;
  prompt: string;
  numTests: number;
  temperature: number;
  topP: number;
  topK: number;
  seed: number;
}

export interface DeterminismTestResult {
  outputs: string[];
  deterministic: boolean;
  error?: string;
}

export async function testDeterminism(
  params: DeterminismTestParams
): Promise<DeterminismTestResult> {
  const { host, port, prompt, numTests, temperature, topP, topK, seed } =
    params;

  // Validate inputs
  if (!host.trim() || !port.trim()) {
    return {
      outputs: [],
      deterministic: false,
      error: "Host and port are required",
    };
  }

  if (!prompt.trim()) {
    return {
      outputs: [],
      deterministic: false,
      error: "Prompt is required",
    };
  }

  if (numTests < 1 || numTests > 100) {
    return {
      outputs: [],
      deterministic: false,
      error: "Number of tests must be between 1 and 100",
    };
  }

  // Construct URL
  const baseUrl =
    host.startsWith("http://") || host.startsWith("https://")
      ? `${host}:${port}`
      : `http://${host}:${port}`;
  const url = `${baseUrl}/generate`;

  const outputs: string[] = [];

  try {
    // Loop and call API numTests times
    for (let i = 0; i < numTests; i++) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompts: [prompt],
          temperature,
          top_p: topP,
          top_k: topK,
          seed,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} - ${response.statusText}`
        );
      }

      const data = await response.json();
      if (!data.outputs || !Array.isArray(data.outputs) || data.outputs.length === 0) {
        throw new Error("Invalid response format: missing outputs");
      }

      outputs.push(data.outputs[0]);
    }

    // Check if all outputs are identical
    const deterministic = outputs.length > 0 && outputs.every((o) => o === outputs[0]);

    return {
      outputs,
      deterministic,
    };
  } catch (error) {
    return {
      outputs,
      deterministic: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error occurred while calling API",
    };
  }
}

