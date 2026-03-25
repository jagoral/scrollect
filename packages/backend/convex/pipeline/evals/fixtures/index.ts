export type { FixtureDocument, FixtureSection } from "./types";
export { BOOK_EN_LEARNING } from "./book-en-learning";
export { ARTICLE_EN_ARCHITECTURE } from "./article-en-architecture";
export { YOUTUBE_EN_ML } from "./youtube-en-ml";
export { BOOK_PL_LEWANDOWSKI } from "./book-pl-lewandowski";

import { BOOK_EN_LEARNING } from "./book-en-learning";
import { ARTICLE_EN_ARCHITECTURE } from "./article-en-architecture";
import { YOUTUBE_EN_ML } from "./youtube-en-ml";
import { BOOK_PL_LEWANDOWSKI } from "./book-pl-lewandowski";
import type { FixtureDocument } from "./types";

export const ALL_FIXTURES: FixtureDocument[] = [
  BOOK_EN_LEARNING,
  ARTICLE_EN_ARCHITECTURE,
  YOUTUBE_EN_ML,
  BOOK_PL_LEWANDOWSKI,
];

export const EN_FIXTURES: FixtureDocument[] = [
  BOOK_EN_LEARNING,
  ARTICLE_EN_ARCHITECTURE,
  YOUTUBE_EN_ML,
];

export const PL_FIXTURES: FixtureDocument[] = [BOOK_PL_LEWANDOWSKI];
