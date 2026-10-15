import { redirect } from "next/navigation";

// /talk was split into /call and /chat; old links and bookmarks land on chat.
export default function Talk() {
  redirect("/chat");
}
