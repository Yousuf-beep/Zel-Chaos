"use client";

import ChatApp from "@/components/chat/ChatApp";
import { useRequireUser } from "@/lib/store";

// Chat with Nola: listens, reassures and suggests, with saved chats, voice mode and doctor-visit
// reports. The structured symptom check stays at /call.
export default function Chat() {
  const user = useRequireUser();
  if (!user) return null;
  return <ChatApp />;
}
