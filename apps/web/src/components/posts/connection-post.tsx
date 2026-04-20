import { ArrowLeftRight } from "lucide-react";

import { PostShell } from "./post-shell";
import type { ConnectionTypeData, PostView } from "./types";

interface ConnectionPostProps {
  post: PostView & { typeData: ConnectionTypeData };
}

export function ConnectionPost({ post }: ConnectionPostProps) {
  const { sourceATitleHint, sourceBTitleHint, sourceAKeyIdea, sourceBKeyIdea } = post.typeData;

  return (
    <PostShell post={post}>
      <div data-testid="connection-content">
        <div className="mb-4 grid grid-cols-[1fr_28px_1fr] items-stretch gap-3">
          <div className="border border-border bg-violet-500/[0.03] px-3.5 py-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-500">
              Source A
            </div>
            <div
              data-testid="connection-source-a"
              className="truncate text-[12px] text-muted-foreground/90"
            >
              {sourceATitleHint}
            </div>
            {sourceAKeyIdea && (
              <p
                data-testid="connection-key-idea-a"
                className="mt-2 text-[13px] italic leading-[1.5] text-foreground/85"
              >
                &ldquo;{sourceAKeyIdea}&rdquo;
              </p>
            )}
          </div>
          <div className="flex items-center justify-center text-violet-500">
            <ArrowLeftRight className="size-4" />
          </div>
          <div className="border border-border bg-violet-500/[0.03] px-3.5 py-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-500">
              Source B
            </div>
            <div
              data-testid="connection-source-b"
              className="truncate text-[12px] text-muted-foreground/90"
            >
              {sourceBTitleHint}
            </div>
            {sourceBKeyIdea && (
              <p
                data-testid="connection-key-idea-b"
                className="mt-2 text-[13px] italic leading-[1.5] text-foreground/85"
              >
                &ldquo;{sourceBKeyIdea}&rdquo;
              </p>
            )}
          </div>
        </div>
        <p className="font-logo text-[18.5px] font-normal leading-[1.45] tracking-tight text-foreground">
          {post.content}
        </p>
      </div>
    </PostShell>
  );
}
