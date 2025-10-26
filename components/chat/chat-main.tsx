"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowUp,
  Brain,
  CheckCircle,
  Clock,
  AlertCircle,
  Play,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";
import type { UIMessage } from "ai";

const placeholders = [
  "Ask anything to chat...",
  "Run a registered tool...",
  "Save something to memory...",
  "Ask me to recall a memory...",
  "Combine tools and memory in one request...",
];

// Component to render workflow execution results
function WorkflowExecutionResult({ output }: { output: any }) {
  const [showDetails, setShowDetails] = useState(false);

  // Create flow nodes from step details
  const flowNodes = useMemo(() => {
    if (!output.stepDetails || !Array.isArray(output.stepDetails)) return [];

    return output.stepDetails.map((step: any, index: number) => {
      const status = step.status || "completed";
      const color =
        status === "completed"
          ? "#22c55e"
          : status === "failed"
          ? "#ef4444"
          : status === "running"
          ? "#f59e0b"
          : "#9ca3af";

      return {
        id: step.stepId,
        data: {
          label: (
            <div className="text-center">
              <div className="font-medium text-sm">{step.stepName}</div>
              <div className="text-xs text-gray-500">{step.stepType}</div>
              <div className="text-xs text-gray-400">
                {step.executionTime}ms
              </div>
            </div>
          ),
        },
        position: { x: index * 200, y: 0 },
        style: {
          backgroundColor: color + "20",
          border: `2px solid ${color}`,
          color: "#111827",
          borderRadius: "8px",
          minWidth: "120px",
        },
      };
    });
  }, [output.stepDetails]);

  // Create flow edges connecting steps
  const flowEdges = useMemo(() => {
    if (!output.stepDetails || output.stepDetails.length < 2) return [];

    return output.stepDetails.slice(0, -1).map((step: any, index: number) => ({
      id: `edge-${index}`,
      source: step.stepId,
      target: output.stepDetails[index + 1].stepId,
      style: { stroke: "#6b7280", strokeWidth: 2 },
    }));
  }, [output.stepDetails]);

  return (
    <div className="space-y-4">
      {/* Workflow Summary */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <h3 className="font-semibold text-green-800">
            Workflow Completed Successfully
          </h3>
        </div>
        <div className="text-sm text-green-700 space-y-1">
          <div>
            <strong>Workflow:</strong> {output.workflowName}
          </div>
          <div>
            <strong>Steps Executed:</strong> {output.stepsExecuted}
          </div>
          <div>
            <strong>Total Time:</strong> {output.totalExecutionTime}ms
          </div>
          <div>
            <strong>Run ID:</strong>{" "}
            <code className="bg-green-100 px-1 rounded">{output.runId}</code>
          </div>
        </div>
      </div>

      {/* Step Sequence */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">Step Sequence</h4>
        <div className="text-sm text-blue-700">
          {output.summary?.stepSequence || "No sequence available"}
        </div>
      </div>

      {/* ReactFlow Visualization */}
      {flowNodes.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <h4 className="font-medium text-gray-800">Execution Flow</h4>
          </div>
          <div className="h-64 relative">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              className="w-full h-full"
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
        </div>
      )}

      {/* Step Details */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Step Details</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? "Hide Details" : "Show Details"}
          </Button>
        </div>

        {showDetails && (
          <div className="space-y-3">
            {output.stepDetails?.map((step: any, index: number) => (
              <Card key={step.stepId} className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      step.status === "completed"
                        ? "bg-green-500"
                        : step.status === "failed"
                        ? "bg-red-500"
                        : "bg-gray-400"
                    }`}
                  />
                  <span className="font-medium">{step.stepName}</span>
                  <span className="text-sm text-gray-500">
                    ({step.stepType})
                  </span>
                  <span className="text-sm text-gray-400 ml-auto">
                    {step.executionTime}ms
                  </span>
                </div>

                {step.output && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                      View Output
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-50 p-2 rounded border overflow-auto max-h-32">
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Final Results */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-2">Final Results</h4>
        <details>
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
            View Final Output
          </summary>
          <pre className="mt-2 text-xs bg-white p-3 rounded border overflow-auto max-h-48">
            {JSON.stringify(output.finalResult, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

export default function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");
  const [hasMessages, setHasMessages] = useState(initialMessages.length > 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputCardRef = useRef<HTMLDivElement>(null);
  const [placeholder, setPlaceholder] = useState(placeholders[0]);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  const { messages, sendMessage, status } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages, id }) {
        return { body: { message: messages[messages.length - 1], id } };
      },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && !hasMessages) {
      setHasMessages(true);
    }
  }, [messages, hasMessages]);

  useEffect(() => {
    if (input.trim()) return; // Don't animate when user is typing

    const currentPlaceholder = placeholders[placeholderIndex];

    if (isTyping) {
      if (charIndex < currentPlaceholder.length) {
        const timer = setTimeout(() => {
          setPlaceholder(currentPlaceholder.slice(0, charIndex + 1));
          setCharIndex(charIndex + 1);
        }, 50);
        return () => clearTimeout(timer);
      } else {
        // Finished typing, wait then start deleting
        const timer = setTimeout(() => {
          setIsTyping(false);
        }, 2000);
        return () => clearTimeout(timer);
      }
    } else {
      if (charIndex > 0) {
        const timer = setTimeout(() => {
          setPlaceholder(currentPlaceholder.slice(0, charIndex - 1));
          setCharIndex(charIndex - 1);
        }, 50);
        return () => clearTimeout(timer);
      } else {
        // Finished deleting, move to next placeholder
        const timer = setTimeout(() => {
          setPlaceholderIndex((placeholderIndex + 1) % placeholders.length);
          setIsTyping(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [charIndex, isTyping, placeholderIndex, input, placeholders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    sendMessage({ parts: [{ type: "text", text: userMessage }] });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <div
      className={`h-screen relative mx-auto flex flex-col pt-8 ${
        hasMessages ? "" : "justify-center"
      }`}
    >
      {/* Messages Area */}
      <div
        className={`overflow-y-auto transition-all duration-500 ${
          hasMessages ? "pb-48" : "pb-0"
        }`}
      >
        {hasMessages ? (
          <div className="max-w-3xl mx-auto p-4 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user"
                    ? "justify-end ml-16"
                    : "justify-start"
                }`}
              >
                <div
                  className={`rounded-2xl p-4 text-sm font-extralight ${
                    message.role === "user" ? "bg-stone-100" : ""
                  }`}
                >
                  {message.role === "user" ? (
                    <>
                      {message.parts.map(
                        (p) =>
                          p.type === "text" && (
                            <p className="whitespace-pre-wrap">{p.text}</p>
                          )
                      )}
                    </>
                  ) : (
                    <>
                      {message.parts.map((p, partIndex) =>
                        p.type === "step-start" ? null : p.type === "text" ? (
                          <MarkdownRenderer
                            key={partIndex}
                            content={p.text}
                            className="prose prose-sm max-w-none dark:prose-invert"
                          />
                        ) : p.type.startsWith("tool-") &&
                          ((p.type === "tool-run_workflow_auto" &&
                            (p as any).state === "output-available") ||
                            ((p as any).output &&
                              (p as any).output.workflowName &&
                              (p as any).output.stepDetails)) ? (
                          // Special rendering for workflow execution results
                          <div key={partIndex} className="mt-4">
                            <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
                              <Play className="w-4 h-4" />
                              <span>
                                Executed workflow:{" "}
                                {(p as any).input?.workflowId ||
                                  (p as any).output?.workflowName}
                              </span>
                            </div>
                            {(p as any).output && (
                              <WorkflowExecutionResult
                                output={(p as any).output}
                              />
                            )}
                          </div>
                        ) : (
                          // Render other tool calls/results or any non-text part
                          <div key={partIndex} className="mt-2">
                            <details className="text-xs">
                              <summary className="cursor-pointer p-2 border rounded-md bg-stone-50 hover:bg-stone-100">
                                {p.type.startsWith("tool-")
                                  ? `Tool Call: ${p.type.replace("tool-", "")}`
                                  : `Result: ${p.type}`}
                              </summary>
                              <pre className="mt-2 p-3 border rounded-md bg-stone-50 whitespace-pre-wrap break-words overflow-auto max-h-64">
                                {JSON.stringify(p, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-stone-100 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-4 space-y-4 flex items-center justify-center">
            <div className="text-center mb-4">
              <div className="flex items-center justify-center mb-3">
                <h1 className="text-2xl font-bold">
                  Hi, I'm Mnemo — Chat with Tools and Memory
                </h1>
              </div>
              <p className="text-muted-foreground text-sm font-thin mb-3">
                Ask questions, run tools, and remember what matters.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input Card */}
      <div
        ref={inputCardRef}
        className={`transition-all duration-500 ${
          hasMessages
            ? "absolute bottom-0 left-0 right-0 backdrop-blur-sm "
            : "relative"
        }`}
      >
        <div className="max-w-2xl mx-auto mb-4">
          <Card className="shadow-lg rounded-3xl">
            <CardContent className="p-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    input.trim() || hasMessages
                      ? "Type your message here..."
                      : placeholder
                  }
                  disabled={isLoading}
                  className="min-h-[60px] max-h-[200px] resize-none border-none"
                  rows={1}
                />

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    size="sm"
                  >
                    <ArrowUp className="w-4 h-5" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
