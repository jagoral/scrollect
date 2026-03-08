import { redirect } from "next/navigation";

import { isAuthenticated } from "@/lib/auth-server";

import { UploadContent } from "./upload-content";

export default async function UploadPage() {
  if (!(await isAuthenticated())) redirect("/signin");

  return <UploadContent />;
}
