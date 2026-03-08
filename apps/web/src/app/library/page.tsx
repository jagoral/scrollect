import { api } from "@scrollect/backend/convex/_generated/api";
import { redirect } from "next/navigation";

import { isAuthenticated, preloadAuthQuery } from "@/lib/auth-server";

import { LibraryContent } from "./library-content";

export default async function LibraryPage() {
  if (!(await isAuthenticated())) redirect("/signin");

  const preloadedDocuments = await preloadAuthQuery(api.documents.list);

  return <LibraryContent preloadedDocuments={preloadedDocuments} />;
}
