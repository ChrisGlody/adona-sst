import { QdrantClient } from '@qdrant/js-client-rest';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

export interface MemoryMetadata {
  userId: string;
  timestamp: number;
}

export interface Memory {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  vector?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface MemorySearchParams {
  userId: string;
  query?: string;
  vector?: number[];
  limit?: number;
  threshold?: number;
}

export class MemoryStorage {
  private client: QdrantClient;
  private collectionName: string;

  constructor(url: string, apiKey?: string, collectionName: string = 'chat-with-memory') {
    this.client = new QdrantClient({ url, apiKey });
    this.collectionName = collectionName;
  }

  async initialize(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: 1536, // OpenAI embedding size
            distance: 'Cosine',
          },
        });

        // Create payload indexes for efficient filtering
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'metadata.userId',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'metadata.timestamp',
          field_schema: 'integer',
        });
      }
    } catch (error) {
      console.error('Failed to initialize memory storage:', error);
      throw error;
    }
  }

  async addMemory(memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.client.upsert(this.collectionName, {
      points: [{
        id,
        vector: memory.vector || await this.embedQuery(memory.content),
        payload: {
          content: memory.content,
          metadata: memory.metadata,
          createdAt: now,
          updatedAt: now,
        },
      }],
    });

    return id;
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<void> {
    const now = Date.now();
    
    await this.client.setPayload(this.collectionName, {
      points: [id],
      payload: {
        ...updates,
        updatedAt: now,
      },
    });
  }

  async deleteMemory(id: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      points: [id],
    });
  }

  async deleteAllMemories(userId: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      filter: {
        must: [
          {
            key: 'metadata.userId',
            match: { value: userId },
          },
        ],
      },
    });
  }

  async getMemory(id: string): Promise<Memory | null> {
    try {
      const result = await this.client.retrieve(this.collectionName, {
        ids: [id],
      });

      if (result.length === 0) return null;

      const point = result[0];
      return {
        id: point.id as string,
        content: point.payload?.content as string,
        metadata: point.payload?.metadata as MemoryMetadata,
        vector: point.vector as number[],
        createdAt: point.payload?.createdAt as number,
        updatedAt: point.payload?.updatedAt as number,
      };
    } catch (error) {
      console.error('Failed to get memory:', error);
      return null;
    }
  }

  async searchMemories(params: MemorySearchParams): Promise<Memory[]> {
    const { userId, query, vector, limit = 10, threshold = 0.1 } = params;

    const filter: any = {
      must: [
        {
          key: 'metadata.userId',
          match: { value: userId },
        },
      ],
    };

    const searchParams: any = {
      filter,
      limit
    };

    if(!vector && !query) {
      throw new Error('Either vector or query must be provided');
    }

    searchParams.vector = vector || await this.embedQuery(query || '');
    searchParams.score_threshold = threshold;

    const result = await this.client.search(this.collectionName, searchParams);

    return result.map((point) => ({
      id: point.id as string,
      content: point.payload?.content as string,
      metadata: point.payload?.metadata as MemoryMetadata,
      vector: point.vector as number[]  ,
      createdAt: point.payload?.createdAt as number,
      updatedAt: point.payload?.updatedAt as number,
    }));
  }

  async embedQuery(query: string): Promise<number[]> {
    const { embedding } = await embed({
      model: openai.textEmbeddingModel('text-embedding-3-small'),
      value: query,
    });
    return embedding;
  }
}
