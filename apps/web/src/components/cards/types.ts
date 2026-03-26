import type { Id } from "@scrollect/backend/convex/_generated/dataModel";

export type PostType = "insight" | "quiz" | "quote" | "summary" | "connection";

export type InsightTypeData = {
  type: "insight";
};

export type QuizTypeData = {
  type: "quiz";
  variant: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type QuoteTypeData = {
  type: "quote";
  quotedText: string;
  attribution?: string;
};

export type SummaryTypeData = {
  type: "summary";
  bulletPoints: string[];
};

export type ConnectionTypeData = {
  type: "connection";
  sourceATitleHint: string;
  sourceBTitleHint: string;
  connectionType?: "cross_document" | "within_document";
  sourceAKeyIdea?: string;
  sourceBKeyIdea?: string;
};

export type TypeData =
  | InsightTypeData
  | QuizTypeData
  | QuoteTypeData
  | SummaryTypeData
  | ConnectionTypeData;

export type { DislikeReason } from "@scrollect/backend/convex/lib/validators";

import type { DocumentTag } from "@/components/tags/types";

export type { DocumentTag as PostCardTag } from "@/components/tags/types";

export interface PostCardData {
  _id: Id<"posts">;
  content: string;
  postType: PostType;
  typeData: TypeData;
  primarySourceDocumentTitle: string;
  primarySourceDocumentId: Id<"documents">;
  fileType?: string;
  sectionTitle?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  cardDraftId?: Id<"cardDrafts"> | null;
  createdAt: number;
  reaction?: "like" | "dislike" | null;
  isBookmarked?: boolean;
  isNew?: boolean;
  tags?: DocumentTag[];
}
