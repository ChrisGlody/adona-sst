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
import type { SearchResult } from "./types";

interface AddDocumentResult {
  id: string;
  success: boolean;
  error?: string;
}

interface BatchUploadResult {
  ids: string[];
  success: boolean;
  error?: string;
}

interface SearchResponse {
  results: SearchResult[];
  success: boolean;
  error?: string;
}

export default function HybridSearchPage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Add Document State
  const [docText, setDocText] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docId, setDocId] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [addDocResult, setAddDocResult] = useState<AddDocumentResult | null>(
    null
  );

  // Batch Upload State
  const [batchJson, setBatchJson] = useState("");
  const [batchSize, setBatchSize] = useState("4");
  const [uploadingBatch, setUploadingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchUploadResult | null>(
    null
  );

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLimit, setSearchLimit] = useState("10");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Initialize State
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<string | null>(null);

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

  const handleAddDocument = async () => {
    if (!docText.trim()) {
      setAddDocResult({
        id: "",
        success: false,
        error: "Text is required",
      });
      return;
    }

    setAddingDoc(true);
    setAddDocResult(null);

    try {
      const payload: Record<string, unknown> = {};
      if (docTitle.trim()) {
        payload.title = docTitle.trim();
      }

      const response = await fetch("/api/hybrid-search/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: docText.trim(),
          id: docId.trim() || undefined,
          payload: Object.keys(payload).length > 0 ? payload : undefined,
        }),
      });

      const result: AddDocumentResult = await response.json();
      setAddDocResult(result);

      if (result.success) {
        setDocText("");
        setDocTitle("");
        setDocId("");
      }
    } catch (error) {
      setAddDocResult({
        id: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setAddingDoc(false);
    }
  };

  const handleBatchUpload = async () => {
    if (!batchJson.trim()) {
      setBatchResult({
        ids: [],
        success: false,
        error: "JSON is required",
      });
      return;
    }

    let documents;
    try {
      documents = JSON.parse(batchJson);
      if (!Array.isArray(documents)) {
        throw new Error("JSON must be an array of documents");
      }
    } catch (error) {
      setBatchResult({
        ids: [],
        success: false,
        error:
          error instanceof Error
            ? `Invalid JSON: ${error.message}`
            : "Invalid JSON format",
      });
      return;
    }

    const batchSizeNum = parseInt(batchSize);
    if (isNaN(batchSizeNum) || batchSizeNum < 1 || batchSizeNum > 100) {
      setBatchResult({
        ids: [],
        success: false,
        error: "Batch size must be between 1 and 100",
      });
      return;
    }

    setUploadingBatch(true);
    setBatchResult(null);

    try {
      const response = await fetch("/api/hybrid-search/documents/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documents,
          batchSize: batchSizeNum,
        }),
      });

      const result: BatchUploadResult = await response.json();
      setBatchResult(result);

      if (result.success) {
        setBatchJson("");
      }
    } catch (error) {
      setBatchResult({
        ids: [],
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setUploadingBatch(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError("Query is required");
      return;
    }

    const limitNum = parseInt(searchLimit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      setSearchError("Limit must be between 1 and 100");
      return;
    }

    setSearching(true);
    setSearchResults([]);
    setSearchError(null);

    try {
      const response = await fetch("/api/hybrid-search/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery.trim(),
          limit: limitNum,
        }),
      });

      const result: SearchResponse = await response.json();

      if (result.success) {
        setSearchResults(result.results);
      } else {
        setSearchError(result.error || "Search failed");
      }
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setSearching(false);
    }
  };

  const handleInitialize = async () => {
    setInitializing(true);
    setInitResult(null);

    try {
      const response = await fetch("/api/hybrid-search/collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result: { success: boolean; error?: string } =
        await response.json();

      setInitResult(
        result.success
          ? "Collection initialized successfully"
          : result.error || "Failed to initialize"
      );
    } catch (error) {
      setInitResult(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setInitializing(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <>
      <Header />
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Hybrid Search</h1>
          <p className="text-muted-foreground">
            Combining semantic and keyword search for better results using
            FastEmbed and BM25
          </p>
        </div>

        {/* Initialize Collection */}
        <Card>
          <CardHeader>
            <CardTitle>Collection Setup</CardTitle>
            <CardDescription>
              Initialize the Qdrant collection with hybrid search configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleInitialize}
              disabled={initializing}
              variant="outline"
            >
              {initializing ? "Initializing..." : "Initialize Collection"}
            </Button>
            {initResult && (
              <div
                className={`text-sm rounded-md p-3 ${
                  initResult.includes("successfully")
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {initResult}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Document Section */}
        <Card>
          <CardHeader>
            <CardTitle>Add Document</CardTitle>
            <CardDescription>
              Add a single document to the search index
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="docId"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Document ID (optional)
              </label>
              <Input
                id="docId"
                type="text"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="Leave empty for auto-generated ID"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="docTitle"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Title (optional)
              </label>
              <Input
                id="docTitle"
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="docText"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Text *
              </label>
              <Textarea
                id="docText"
                rows={6}
                value={docText}
                onChange={(e) => setDocText(e.target.value)}
                placeholder="Enter document text here..."
              />
            </div>

            {addDocResult && (
              <div
                className={`text-sm rounded-md p-3 ${
                  addDocResult.success
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {addDocResult.success ? (
                  <div>
                    <strong>Success!</strong> Document added with ID:{" "}
                    {addDocResult.id}
                  </div>
                ) : (
                  <div>
                    <strong>Error:</strong> {addDocResult.error}
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleAddDocument} disabled={addingDoc}>
              {addingDoc ? "Adding..." : "Add Document"}
            </Button>
          </CardContent>
        </Card>

        {/* Batch Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle>Batch Upload</CardTitle>
            <CardDescription>
              Upload multiple documents at once (JSON array format)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="batchSize"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Batch Size
              </label>
              <Input
                id="batchSize"
                type="number"
                min="1"
                max="100"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                placeholder="4"
              />
              <p className="text-xs text-muted-foreground">
                Number of documents to process per batch (default: 4)
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="batchJson"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Documents JSON *
              </label>
              <Textarea
                id="batchJson"
                rows={10}
                value={batchJson}
                onChange={(e) => setBatchJson(e.target.value)}
                placeholder={`[\n  { "text": "Document 1", "payload": { "title": "Title 1" } },\n  { "text": "Document 2", "id": "custom-id-2" }\n]`}
              />
              <p className="text-xs text-muted-foreground">
                Array of objects with "text" (required), optional "id" and
                "payload"
              </p>
            </div>

            {batchResult && (
              <div
                className={`text-sm rounded-md p-3 ${
                  batchResult.success
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {batchResult.success ? (
                  <div>
                    <strong>Success!</strong> Added {batchResult.ids.length}{" "}
                    documents
                  </div>
                ) : (
                  <div>
                    <strong>Error:</strong> {batchResult.error}
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleBatchUpload} disabled={uploadingBatch}>
              {uploadingBatch ? "Uploading..." : "Upload Batch"}
            </Button>
          </CardContent>
        </Card>

        {/* Search Section */}
        <Card>
          <CardHeader>
            <CardTitle>Search</CardTitle>
            <CardDescription>
              Perform hybrid search combining dense and sparse vectors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3 space-y-2">
                <label
                  htmlFor="searchQuery"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Query *
                </label>
                <Input
                  id="searchQuery"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !searching) {
                      handleSearch();
                    }
                  }}
                  placeholder="Enter search query..."
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="searchLimit"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Limit
                </label>
                <Input
                  id="searchLimit"
                  type="number"
                  min="1"
                  max="100"
                  value={searchLimit}
                  onChange={(e) => setSearchLimit(e.target.value)}
                  placeholder="10"
                />
              </div>
            </div>

            {searchError && (
              <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3">
                {searchError}
              </div>
            )}

            <Button onClick={handleSearch} disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </Button>
          </CardContent>
        </Card>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Search Results ({searchResults.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {searchResults.map((result, idx) => (
                  <div
                    key={result.id}
                    className="border rounded-lg p-4 bg-muted/50"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm font-medium">
                        Result #{idx + 1}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Score: {result.score.toFixed(4)}
                      </div>
                    </div>
                    <div className="text-sm font-medium mb-1">
                      ID: {result.id}
                    </div>
                    {result.payload.title && (
                      <div className="text-lg font-semibold mb-2">
                        {result.payload.title}
                      </div>
                    )}
                    <div
                      className="text-sm whitespace-pre-wrap break-words bg-background p-3 rounded border"
                      dangerouslySetInnerHTML={{
                        __html:
                          typeof result.payload.text === "string"
                            ? result.payload.text
                            : String(result.payload.text || ""),
                      }}
                    />
                    {Object.keys(result.payload).length > 2 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                          View all metadata
                        </summary>
                        <pre className="text-xs mt-2 bg-background p-2 rounded border overflow-auto">
                          {JSON.stringify(result.payload, null, 2)}
                        </pre>
                      </details>
                    )}
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
