import { getAuthUser } from "@/lib/auth.server";
import type { BatchUploadRequest, ApiResponse } from "@/app/hybrid-search/types";

const BACKEND_API_URL =
  process.env.HYBRID_SEARCH_API_URL || "http://localhost:8001";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401 }
    );
  }

  try {
    const body: BatchUploadRequest = await req.json();
    const { documents, batchSize = 4 } = body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "At least one document is required",
        }),
        { status: 400 }
      );
    }

    if (batchSize < 1 || batchSize > 100) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Batch size must be between 1 and 100",
        }),
        { status: 400 }
      );
    }

    // Validate each document
    for (const doc of documents) {
      if (!doc.text || typeof doc.text !== "string" || !doc.text.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "All documents must have a text field",
          }),
          { status: 400 }
        );
      }
    }

    // Call Python backend service
    const response = await fetch(`${BACKEND_API_URL}/api/documents/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: documents.map((doc) => ({
          text: doc.text.trim(),
          id: doc.id,
          payload: doc.payload,
        })),
        batchSize,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({
          success: false,
          error: `Backend error: ${response.status} - ${errorText}`,
        }),
        { status: response.status }
      );
    }

    const backendResponse: ApiResponse<{ ids: string[] }> =
      await response.json();

    if (!backendResponse.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: backendResponse.error || "Failed to upload documents",
        }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        ids: backendResponse.data?.ids || [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error uploading documents batch:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500 }
    );
  }
}
