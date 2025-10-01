"use client";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  // Simple markdown parsing for basic formatting with memory highlighting
  const parseMarkdown = (text: string) => {
    return (
      text
        .replace(
          /^# (.*$)/gim,
          '<h1 class="text-3xl font-bold mb-4 text-gray-900">$1</h1>'
        )
        .replace(
          /^## (.*$)/gim,
          '<h2 class="text-2xl font-bold mb-3 text-gray-900">$1</h2>'
        )
        .replace(
          /^### (.*$)/gim,
          '<h3 class="text-xl font-bold mb-2 text-gray-900">$1</h3>'
        )
        .replace(/\*\*(.*)\*\*/gim, '<strong class="font-semibold">$1</strong>')
        .replace(/\*(.*)\*/gim, '<em class="italic">$1</em>')
        .replace(/^- (.*$)/gim, '<li class="ml-4">• $1</li>')
        // Memory highlighting - special styling for <memory> tags
        .replace(
          /<memory>(.*?)<\/memory>/gim,
          '<span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-md text-sm font-medium border border-blue-200 dark:border-blue-700">$1</span>'
        )
        .replace(/\n/gim, "<br />")
    );
  };

  return (
    <div
      className={`prose prose-gray max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
    />
  );
}
