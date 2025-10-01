"use client";

import Link from "next/link";
import { Brain, SquarePenIcon, Menu } from "lucide-react";
import Chat from "./chat-main";
import type { UIMessage } from "ai";
import UserButton from "@/components/user-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

// Sidebar content component to reuse in both desktop and mobile
function SidebarContent({
  userChats,
  currentChatId,
  onChatSelect,
}: {
  userChats: any[];
  currentChatId: string;
  onChatSelect?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <div className="flex items-center gap-2 px-2 py-1">
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={onChatSelect}
          >
            <Brain className="w-6 h-6" />
          </Link>
        </div>
        <Link
          href="/chat"
          className="hover:bg-stone-200 px-2 py-2 rounded-md text-sm flex items-center gap-2 font-light mt-4"
          onClick={onChatSelect}
        >
          <SquarePenIcon className="w-4 h-4" />
          New chat
        </Link>
        <div className="space-y-1 mt-4">
          <div>
            <span className="text-sm text-stone-400 px-2 font-light">
              Chats
            </span>
          </div>
          {userChats.map((c) => (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className={`block px-2 py-2 rounded-md text-sm font-light hover:bg-stone-200 whitespace-nowrap overflow-hidden text-ellipsis ${
                c.id === currentChatId ? "bg-stone-100" : ""
              }`}
              onClick={onChatSelect}
            >
              {c.title ?? "Untitled chat"}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex gap-2 items-center border-t p-3 mt-auto">
        <UserButton />
      </div>
    </div>
  );
}

export function ChatLayout({
  id,
  initialMessages,
  userChats,
}: {
  id: string;
  initialMessages: UIMessage[];
  userChats: any[];
}) {
  const isMobile = useIsMobile();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <div className="h-screen flex">
      {/* Desktop Sidebar */}
      <aside
        className={`h-screen sticky w-64 border-r border-stone-200 space-y-2 overflow-y-auto bg-stone-50 ${
          isMobile ? "hidden" : "block"
        }`}
      >
        <SidebarContent userChats={userChats} currentChatId={id} />
      </aside>

      <main className="flex-1 flex flex-col">
        {/* Mobile Header with Menu Button */}
        {isMobile && (
          <header className="border-b border-stone-200 p-4 bg-white flex-shrink-0">
            <div className="flex items-center justify-between">
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 bg-stone-50">
                  <SidebarContent
                    userChats={userChats}
                    currentChatId={id}
                    onChatSelect={() => setIsSheetOpen(false)}
                  />
                </SheetContent>
              </Sheet>
              <Link href="/" className="flex items-center gap-2">
                <Brain className="w-6 h-6" />
              </Link>
              <div className="w-10" /> {/* Spacer for centering */}
            </div>
          </header>
        )}

        {/* Chat Content */}
        <div className="flex-1">
          <Chat id={id} initialMessages={initialMessages} />
        </div>
      </main>
    </div>
  );
}
