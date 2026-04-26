import type { api } from "@scrollect/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type FeedListResult = FunctionReturnType<typeof api.feed.queries.list>;
export type FeedPost = FeedListResult["page"][number];

export type DislikeReason = "not_interesting" | "already_know" | "wrong_type" | "low_quality";
