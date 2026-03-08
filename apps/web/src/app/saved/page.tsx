import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth-server";

import { SavedContent } from "./saved-content";

export default async function SavedPage() {
  if (!(await isAuthenticated())) redirect("/signin");

  return <SavedContent />;
}
