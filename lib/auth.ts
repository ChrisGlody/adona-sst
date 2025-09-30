// lib/auth.ts
"use client";
import { fetchAuthSession } from "aws-amplify/auth";

export async function getIdToken(): Promise<string | null> {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString() ?? null;
}