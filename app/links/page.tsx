"use client";

import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface NavigationCard {
  title: string;
  description: string;
  href: string;
  icon: string;
}

const navigationCards: NavigationCard[] = [
  {
    title: "Tools",
    description: "Register and run custom tools",
    href: "/tools",
    icon: "🔧",
  },
  {
    title: "Workflows",
    description: "Create and manage AI workflows",
    href: "/workflows",
    icon: "🔄",
  },
  {
    title: "Chat",
    description: "AI chat interface",
    href: "/chat",
    icon: "💬",
  },
  {
    title: "Hybrid Search",
    description: "Semantic + keyword search",
    href: "/hybrid-search",
    icon: "🔍",
  },
  {
    title: "Deterministic Inference",
    description: "Deterministic AI inference",
    href: "/deterministic-inference",
    icon: "🎯",
  },
];

export default function LinksPage() {
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await fetchAuthSession();
        const user = await getCurrentUser();
        if (!mounted) return;
        setUsername(user.signInDetails?.loginId ?? "");
      } catch {
        router.replace("/login");
        return;
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <>
      <Header />
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Welcome to Adona</h1>
          <p className="text-muted-foreground">
            Signed in as <span className="font-medium">{username}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {navigationCards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="h-full transition-all hover:shadow-md cursor-pointer">
                <CardHeader>
                  <div className="text-4xl mb-2">{card.icon}</div>
                  <CardTitle>{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
