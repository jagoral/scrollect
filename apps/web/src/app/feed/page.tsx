"use client";

import { api } from "@scrollect/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useAction, useQuery } from "convex/react";

import { formatDistanceToNow } from "date-fns";
import Markdown from "react-markdown";
import { FileText, Loader2, Sparkles, Rss } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function FeedContent() {
  const posts = useQuery(api.feed.list);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generateFeed = useAction(api.feedGeneration.generate);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateFeed({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate feed");
    } finally {
      setGenerating(false);
    }
  }

  if (posts === undefined) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <p className="mt-1 text-muted-foreground">Your AI-generated learning cards.</p>
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your AI-generated learning cards.</p>
        </div>
        <Button onClick={handleGenerate} disabled={generating} size="sm">
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {posts.length === 0 && !generating ? (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Rss className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold">No posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click &quot;Generate&quot; to create learning cards from your documents.
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate your first feed
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <Card
              key={post._id}
              className="overflow-hidden border-l-4 border-l-primary/40 transition-all hover:border-l-primary hover:shadow-sm"
            >
              <CardContent className="py-5">
                <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed">
                  <Markdown>{post.content}</Markdown>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  {post.sourceDocumentTitle && (
                    <>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {post.sourceDocumentTitle}
                      </span>
                      <span>&middot;</span>
                    </>
                  )}
                  <span>{formatDistanceToNow(post.createdAt, { addSuffix: true })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UnauthenticatedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/signin");
  }, [router]);
  return null;
}

export default function FeedPage() {
  return (
    <>
      <Authenticated>
        <FeedContent />
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </AuthLoading>
    </>
  );
}
