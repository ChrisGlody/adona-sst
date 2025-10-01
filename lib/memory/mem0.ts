import { Memory, Message } from '../mem0/oss/src';
import { log } from '@/utils/logger';

export interface MemoryMetadata {
  userId: string;
}

export class Mem0Memory {
  private client: Memory;

  constructor() {
    // Initialize with environment variables
    this.client = new Memory({
        version: 'v1.1',
        embedder: {
          provider: 'openai',
          config: {
            apiKey: process.env.OPENAI_API_KEY || '',
            model: 'text-embedding-3-small',
          },
        },
        vectorStore: {
            provider: "qdrant",
            config: {
              collectionName: "chat-with-memory",
              url: process.env.QDRANT_URL,
              apiKey: process.env.QDRANT_API_KEY,
            },
        },
        llm: {
          provider: 'openai',
          config: {
            apiKey: process.env.OPENAI_API_KEY || '',
            model: 'gpt-4-turbo-preview',
          },
        },
        disableHistory: true
      });
  }

  async add(messages: Message[], context: MemoryMetadata): Promise<void> {
    try {
      log.info(`Adding memory for user: ${context.userId}`);
      
      await this.client.add(messages, {
        userId: context.userId,
        metadata: {
          timestamp: Date.now(),
        }
      });
      
      log.info('Memory added successfully');
    } catch (error) {
      log.error('Failed to add memory:', error);
      throw error;
    }
  }

  async search(query: string, context: MemoryMetadata): Promise<Array<{ id: string; content: string | undefined }>> {
    try {
      log.info(`Searching memory for user: ${context.userId}, query: ${query}`);
      
      const results = await this.client.search(query, {
        userId: context.userId,
        limit: 10
      });
      
      // Transform mem0ai results to match your existing interface
      const memories = results.results.map((result) => ({
        id: result.id,
        content: result.memory
      }));
      
      log.info(`Found ${memories.length} memories`);
      return memories;
    } catch (error) {
      log.error('Failed to search memory:', error);
      return []; // Return empty array on error to not block chat
    }
  }

  async get(id: string): Promise<any> {
    try {
      log.info(`Getting memory: ${id}`);
      return await this.client.get(id);
    } catch (error) {
      log.error('Failed to get memory:', error);
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      log.info(`Deleting memory: ${id}`);
      await this.client.delete(id);
    } catch (error) {
      log.error('Failed to delete memory:', error);
      throw error;
    }
  }
}