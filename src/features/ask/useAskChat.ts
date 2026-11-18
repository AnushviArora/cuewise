"use client";

import { useSyncExternalStore } from "react";
import { getChat, subscribeChat, type ChatMessage } from "@/lib/ask/chat";

const EMPTY: ChatMessage[] = [];

/** The conversation for one upload (kept for the session, shared across tab switches). */
export function useAskChat(uploadId: string) {
  const messages = useSyncExternalStore(
    subscribeChat,
    () => getChat(uploadId),
    () => EMPTY,
  );
  const asking = messages.some((m) => m.role === "assistant" && (m.status === "pending" || m.status === "streaming"));
  return { messages, asking };
}
