import { getAuthUser } from "@/lib/auth.server";
import type { SearchRequest, SearchResult, ApiResponse } from "@/app/hybrid-search/types";

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
    const body: SearchRequest = await req.json();
    const { query, limit = 10 } = body;

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Query is required",
        }),
        { status: 400 }
      );
    }

    if (limit < 1 || limit > 100) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Limit must be between 1 and 100",
        }),
        { status: 400 }
      );
    }

    // Call Python backend service
    const response = await fetch(`${BACKEND_API_URL}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: query.trim(), limit }),
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

    const backendResponse: { success: boolean; results: SearchResult[]; error: string | null } =
      await response.json();

    if (!backendResponse.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: backendResponse.error || "Search failed",
        }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: backendResponse?.results || [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in hybrid search:", error);
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
