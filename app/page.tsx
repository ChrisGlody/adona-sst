import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className=" flex flex-col gap-[16px] row-start-2 items-center sm:items-start">
        <div className="text-sm text-muted-foreground">Welcome</div>
        <div className="flex gap-2">
          <Link href="/login">
            <Button>Login</Button>
          </Link>
          <Link href="/register">
            <Button variant="secondary">Register</Button>
          </Link>
          <Link href="/chat">
            <Button variant="outline">Go to Chat</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
