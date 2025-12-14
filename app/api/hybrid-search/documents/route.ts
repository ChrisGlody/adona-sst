import { getAuthUser } from "@/lib/auth.server";
import type { AddDocumentRequest, ApiResponse } from "@/app/hybrid-search/types";

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
    const body: AddDocumentRequest = await req.json();
    const { text, id, payload } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Text is required",
        }),
        { status: 400 }
      );
    }

    // Call Python backend service
    const response = await fetch(`${BACKEND_API_URL}/api/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.trim(),
        id,
        payload,
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

    const backendResponse: ApiResponse<{ id: string }> = await response.json();

    if (!backendResponse.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: backendResponse.error || "Failed to add document",
        }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: backendResponse.data?.id || "",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error adding document:", error);
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
