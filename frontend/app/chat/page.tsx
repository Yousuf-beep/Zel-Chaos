"use client";

import CompanionChat from "@/components/CompanionChat";
import { useRequireUser } from "@/lib/store";

// Typing-first door is the Sakhi companion: listens, reassures and suggests, with cycle tracking and per-user memory.
// The voice door (/call) keeps the structured symptom flow.
export default function Chat() {
  const user = useRequireUser();
  if (!user) return null;
  return <CompanionChat />;
}
