"use client";

import { useEffect } from "react";
import { signOut } from "aws-amplify/auth";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await signOut();

        // Clear the server-side cookie
        await fetch("/api/auth/logout", {
          method: "POST",
        });
      } catch {
        // ignore
      } finally {
        router.replace("/");
      }
    })();
  }, [router]);

  return null;
}
