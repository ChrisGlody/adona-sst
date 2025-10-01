"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, Brain } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { UIMessage } from "ai";

const placeholders = [
  "Ask anything to chat...",
  "Run a registered tool...",
  "Save something to memory...",
  "Ask me to recall a memory...",
  "Combine tools and memory in one request...",
];

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
                      {message.parts.map((p) =>
                        p.type === "step-start" ? null : (
                          p.type === "text" ? (
                            <MarkdownRenderer
                              content={p.text}
                              className="prose prose-sm max-w-none dark:prose-invert"
                            />
                          ) : (
                            // Render tool call/result or any non-text part
                            <pre className="text-xs p-3 border rounded-md bg-stone-50 whitespace-pre-wrap break-words overflow-auto max-h-64">
                              {JSON.stringify(p, null, 2)}
                            </pre>
                          )
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
