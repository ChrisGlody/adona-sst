import { getAuthUser } from "@/lib/auth.server";
import { loadChat, getUserChats } from "@/lib/db/queries";
import type { ModelMessage, UIMessage } from "ai";
import { generateId } from "ai";
import { ChatLayout } from "@/components/chat/chat-layout";

function modelToUI(msgs: ModelMessage[]): UIMessage[] {
  return msgs.map((m) => {
    const parts =
      typeof m.content === "string"
        ? [{ type: "text", text: m.content }]
        : Array.isArray(m.content)
        ? (m.content as any[])
            .map((p) =>
              p.type === "text" ? { type: "text", text: p.text } : null
            )
            .filter(Boolean)
        : [];
    return {
      id: generateId(),
      role: m.role as UIMessage["role"],
      parts: parts as UIMessage["parts"],
      createdAt: new Date(),
    };
  });
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getAuthUser();
  console.log("===== chat page",user);
  if (!user) return null;

  const [modelMessages, userChats] = await Promise.all([
    loadChat(id, user.id),
    getUserChats(user.id),
  ]);

  const initialMessages = modelToUI(modelMessages);

  return (
    <ChatLayout
      id={id}
      initialMessages={initialMessages}
      userChats={userChats}
    />
  );
}
