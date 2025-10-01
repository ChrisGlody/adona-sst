import { redirect } from "next/navigation";
import { createChat } from "@/lib/db/queries";
import { getAuthUser } from "@/lib/auth.server";

export default async function Page() {
  const user = await getAuthUser();
  console.log("===== chat page",user);
  if (!user) redirect("/login");
  const id = await createChat(user.sub);
  redirect(`/chat/${id}`);
}
