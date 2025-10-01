"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await getCurrentUser();
        if (mounted) setIsAuthenticated(true);
      } catch {
        if (mounted) setIsAuthenticated(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      setIsAuthenticated(false);
      router.replace("/");
    } catch (err) {
      // no-op
      console.error("Sign out error", err);
    }
  };

  return (
    <div className="w-full border-b">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-3">
        <Link href="/" className="font-medium">
          Adona
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/chat">
            <Button className="h-8">Chat</Button>
          </Link>
          {isAuthenticated === null ? null : isAuthenticated ? (
            <Button onClick={handleLogout} variant="ghost" className="h-8">
              Logout
            </Button>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" className="h-8">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="ghost" className="h-8">
                  Register
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
