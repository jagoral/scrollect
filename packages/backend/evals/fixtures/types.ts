export type FixtureSection = {
  sectionTitle: string;
  sectionSummary: string;
  chunks: Array<{ content: string; chunkId: string }>;
  highlights?: Array<{ highlightId: string; highlightText: string }>;
};

export type FixtureDocument = {
  title: string;
  language: "en" | "pl";
  fileType?: string;
  sections: FixtureSection[];
};
