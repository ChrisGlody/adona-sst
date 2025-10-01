import { openai } from '@ai-sdk/openai'
import { ModelMessage, streamText } from 'ai'

import { Mem0Memory } from '../memory/mem0'

export const chat = async (
  messages: ModelMessage[],
  userId: string,
  memory: Mem0Memory,
  updateStatus?: (status: string) => void,
) => {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const rawContent = lastUser?.content
 
  const searchQuery =
    typeof rawContent === 'string'
      ? rawContent
      : rawContent
      ? JSON.stringify(rawContent)
      : ''

  let memories: { id: string; content: string }[] = []
  if (searchQuery) {
    try {
      updateStatus?.('Searching memory...')
      const result = await memory.search(searchQuery, { userId })
      memories = (result || []).map((m: any) => ({ id: m.id, content: m.content }))
    } catch {
      // ignore memory search errors to not block chat
    }
  }

  const memoryContext =
    memories.length > 0
      ? memories.map((m, index) => `  ${index + 1}. ${m.content}`).join('\n')
      : '  (No saved facts found)'

  const system = `You are a helpful AI chat assistant with long-term memory.

IMPORTANT: You have access to the user's personal memory data below. Use this information to:
- Personalize your responses based on their preferences, history, and context
- Reference relevant facts naturally in conversation
- Avoid repeating questions about information you already know
- Build upon previous conversations and established context

MEMORY DATA - USE THIS TO PERSONALIZE RESPONSES 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Saved User Facts:
${memoryContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Guidelines:
- Reference memory facts naturally when relevant to the conversation
- Do not invent or assume facts not present in the memory
- If unsure about something, ask for clarification
- Keep responses concise and helpful while being personal

MEMORY HIGHLIGHTING:
- When you reference information from your memory data, wrap that specific information in special memory tags: <memory>information from memory</memory>
- Only use these tags for content that directly comes from the saved user facts above
- Use these tags sparingly and only for the most relevant memory-based information
- Example: "I remember you mentioned <memory>you prefer working in the morning</memory>, so this might be a good time to tackle that project."

Current date: ${new Date().toISOString().split('T')[0]}
User ID: ${userId}`


  const response = streamText({
    model: openai('gpt-4o'),
    system,
    messages
  })

  if (searchQuery) { 
    (async () => { 
        try { 
            updateStatus?.('Updating memory...') 
            await memory.add([{ role: 'user', content: searchQuery }], { userId }) 
        } catch { 
            // ignore memory update errors to not block streaming 
        } 
    })() 
  }

  return response
}