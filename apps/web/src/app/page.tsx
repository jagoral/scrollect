"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

function AuthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/library");
  }, [router]);
  return null;
}

export default function Home() {
  return (
    <>
      <Authenticated>
        <AuthenticatedRedirect />
      </Authenticated>
      <Unauthenticated>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <BookOpen className="h-16 w-16 text-muted-foreground" />
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">Scrollect</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              Your AI-powered personal learning feed
            </p>
          </div>
          <Button size="lg" render={<Link href="/signin" />}>
            Sign In
          </Button>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
      </AuthLoading>
    </>
  );
}
