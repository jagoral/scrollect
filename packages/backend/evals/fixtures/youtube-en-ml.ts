import type { FixtureDocument } from "./types";

export const YOUTUBE_EN_ML: FixtureDocument = {
  title: "Introduction to Machine Learning Fundamentals",
  language: "en",
  sections: [
    {
      sectionTitle: "What is Machine Learning",
      sectionSummary:
        "Machine learning is a subset of AI where systems learn from data rather than being explicitly programmed. This paradigm shift has enabled breakthroughs in image recognition, NLP, and recommendation systems.",
      chunks: [
        {
          content:
            "Machine learning is a subset of artificial intelligence where systems learn from data rather than being explicitly programmed. Instead of writing rules by hand, we provide examples and let algorithms discover patterns automatically. This paradigm shift has enabled breakthroughs in image recognition, natural language processing, and recommendation systems that would have been impossible with traditional programming.",
          chunkId: "youtube-en-ml-chunk-0",
        },
      ],
    },
    {
      sectionTitle: "Supervised Learning",
      sectionSummary:
        "Supervised learning uses labeled training data to learn input-to-output mappings. Common tasks include classification (discrete categories) and regression (continuous values). Examples: spam detection, medical diagnosis, house price prediction.",
      chunks: [
        {
          content:
            "There are three main categories of machine learning. Supervised learning uses labeled training data to learn a mapping from inputs to outputs. Common tasks include classification, where we predict discrete categories, and regression, where we predict continuous values. Examples include spam detection, medical diagnosis, and house price prediction.",
          chunkId: "youtube-en-ml-chunk-1",
        },
      ],
    },
    {
      sectionTitle: "Unsupervised and Reinforcement Learning",
      sectionSummary:
        "Unsupervised learning discovers hidden structure in unlabeled data via clustering and dimensionality reduction. Reinforcement learning trains agents to maximize cumulative reward through environment interaction, powering game-playing AIs and robotics.",
      chunks: [
        {
          content:
            "Unsupervised learning works with unlabeled data, discovering hidden structure and patterns. Clustering algorithms group similar data points together, while dimensionality reduction techniques compress high-dimensional data into lower-dimensional representations. These techniques are invaluable for exploratory data analysis and feature engineering.",
          chunkId: "youtube-en-ml-chunk-2",
        },
        {
          content:
            "Reinforcement learning takes a different approach entirely. An agent interacts with an environment, taking actions and receiving rewards or penalties. Over time, the agent learns a policy that maximizes cumulative reward. This paradigm powers game-playing AIs, robotics control systems, and recommendation engines that adapt to user behavior in real time.",
          chunkId: "youtube-en-ml-chunk-3",
        },
      ],
    },
    {
      sectionTitle: "Training Process",
      sectionSummary:
        "Training involves splitting data into training, validation, and test sets. Cross-validation provides robust estimates. Overfitting occurs when a model memorizes training data instead of learning generalizable patterns.",
      chunks: [
        {
          content:
            "The training process involves splitting data into training, validation, and test sets. We fit the model on training data, tune hyperparameters using validation data, and evaluate final performance on the held-out test set. Cross-validation provides more robust estimates by rotating which subset serves as the validation set. Overfitting occurs when a model memorizes training data rather than learning generalizable patterns.",
          chunkId: "youtube-en-ml-chunk-4",
        },
      ],
    },
  ],
};
