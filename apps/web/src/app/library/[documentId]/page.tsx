"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function UnauthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signin");
  }, [router]);
  return null;
}

export default function DocumentDetailPage() {
  return (
    <>
      <Authenticated>
        <div className="container mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-2xl font-bold">Document Detail</h1>
          <p className="mt-2 text-muted-foreground">Document details will appear here.</p>
        </div>
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
      </AuthLoading>
    </>
  );
}
