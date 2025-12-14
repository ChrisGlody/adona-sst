export interface Document {
  id?: string;
  text: string;
  payload?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
  // payload.text may contain HTML highlighting from backend
}

export interface AddDocumentRequest {
  text: string;
  id?: string;
  payload?: Record<string, unknown>;
}

export interface SearchRequest {
  query: string;
  limit?: number;
}

export interface BatchUploadRequest {
  documents: Document[];
  batchSize?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}
