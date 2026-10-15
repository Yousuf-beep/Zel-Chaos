"use client";

import TalkFlow from "@/components/TalkFlow";
import { useRequireUser } from "@/lib/store";

export default function Chat() {
  const user = useRequireUser();
  if (!user) return null;
  return <TalkFlow mode="chat" />;
}
