import type { FixtureDocument } from "./types";

export const BOOK_EN_LEARNING: FixtureDocument = {
  title: "The Art of Effective Learning",
  language: "en",
  sections: [
    {
      sectionTitle: "Spaced Repetition",
      sectionSummary:
        "Spaced repetition exploits the spacing effect by reviewing information at gradually increasing intervals (1, 3, 7, 21 days). This technique forms stronger memories than cramming by spreading exposure over time.",
      chunks: [
        {
          content:
            "Spaced repetition is a learning technique that involves reviewing information at gradually increasing intervals. Instead of cramming all at once, you space out your practice sessions over days, weeks, and months. This approach exploits the spacing effect, a phenomenon where our brains form stronger memories when exposure to information is spread out over time rather than concentrated in a single session.",
          chunkId: "book-en-learning-chunk-0",
        },
        {
          content:
            "The optimal spacing schedule depends on the complexity of the material and the desired retention period. For simple facts, a schedule of 1 day, 3 days, 7 days, and 21 days works well. For complex concepts, shorter intervals with more repetitions may be needed.",
          chunkId: "book-en-learning-chunk-1",
        },
      ],
      highlights: [
        {
          highlightId: "book-en-learning-highlight-0",
          highlightText:
            "our brains form stronger memories when exposure to information is spread out over time rather than concentrated in a single session",
        },
        {
          highlightId: "book-en-learning-highlight-1",
          highlightText:
            "For simple facts, a schedule of 1 day, 3 days, 7 days, and 21 days works well",
        },
      ],
    },
    {
      sectionTitle: "Active Recall",
      sectionSummary:
        "Active recall strengthens memory by forcing retrieval during learning. Research by Karpicke and Roediger showed 80% better retention vs re-reading. Known as the testing effect, it is one of the most robust findings in cognitive psychology.",
      chunks: [
        {
          content:
            "Active recall is the practice of actively stimulating memory during the learning process. Rather than passively reviewing notes, you close the book and try to recall the key points from memory. This forces your brain to strengthen the neural pathways associated with the information, making it easier to retrieve later.",
          chunkId: "book-en-learning-chunk-2",
        },
        {
          content:
            "Research by Karpicke and Roediger demonstrated that students who practiced active recall retained 80% more information than those who simply re-read the material. The testing effect, as it is known, is one of the most robust findings in cognitive psychology.",
          chunkId: "book-en-learning-chunk-3",
        },
      ],
      highlights: [
        {
          highlightId: "book-en-learning-highlight-2",
          highlightText:
            "students who practiced active recall retained 80% more information than those who simply re-read the material",
        },
      ],
    },
    {
      sectionTitle: "Interleaving",
      sectionSummary:
        "Interleaving mixes different topics during study sessions. While blocked practice feels easier, interleaving leads to better long-term retention by forcing continuous strategy retrieval and comparison.",
      chunks: [
        {
          content:
            "Interleaving involves mixing different topics or types of problems during a single study session. While blocked practice, focusing on one topic at a time, feels easier, interleaving leads to better long-term retention and the ability to discriminate between different concepts. This is because interleaving forces the brain to continuously retrieve different strategies and compare them.",
          chunkId: "book-en-learning-chunk-4",
        },
      ],
    },
  ],
};
