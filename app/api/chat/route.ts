import { convertToModelMessages, createIdGenerator, type UIMessage, type ModelMessage } from "ai";
import { chat } from "@/lib/ai/memory-chat";
import { loadChat, saveChat, getUserTools } from "@/lib/db/queries";
import { revalidatePath } from "next/cache";
import { Mem0Memory } from "@/lib/memory/mem0";
import { getAuthUser } from "@/lib/auth.server";

const memory = new Mem0Memory()

export async function POST(req: Request) {
  const { message, id }: { message: UIMessage; id: string } = await req.json();

  const user = await getAuthUser()
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const userId = user.sub

  const previous: ModelMessage[] = await loadChat(id, userId)
  const [lastAsModel] = convertToModelMessages([message])
  const modelMessages: ModelMessage[] = [...previous, lastAsModel]

  // NEW: fetch registered tools for this user
  const tools = await getUserTools(userId)

  const response = await chat(modelMessages, userId, memory, (status) => {
    console.log(status)
  }, tools)

  response.consumeStream()

  return response.toUIMessageStreamResponse({
    originalMessages: [message],
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    onFinish: async ({ messages }) => {
      const allAsModel = [...previous, ...convertToModelMessages(messages)]
      await saveChat({ chatId: id, userId, messages: allAsModel })

      revalidatePath(`/chat/[id]`, "page")
    },
  })
}