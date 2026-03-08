import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth-server";

import { FeedContent } from "./feed-content";

export default async function FeedPage() {
  if (!(await isAuthenticated())) redirect("/signin");

  return <FeedContent />;
}
