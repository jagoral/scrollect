import type { FixtureDocument } from "./types";

export const YOUTUBE_EN_ML: FixtureDocument = {
  title: "Introduction to Machine Learning Fundamentals",
  language: "en",
  fileType: "youtube",
  sections: [
    {
      sectionTitle: "What is Machine Learning",
      sectionSummary:
        "Machine learning is a subset of AI where systems learn from data rather than being explicitly programmed. This paradigm shift has enabled breakthroughs in image recognition, NLP, and recommendation systems.",
      chunks: [
        {
          content:
            "So machine learning is is a subset of artificial intelligence where where systems learn from data rather than being um explicitly programmed. Instead of you know writing rules by hand, we we provide examples and let algorithms discover patterns automatically. This this paradigm shift has like enabled breakthroughs in image recognition, natural language processing, and um recommendation systems that would have been impossible with traditional programming.",
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
            "There are um there are three main categories of machine learning. Supervised learning uses like labeled training data to to learn a mapping from inputs to outputs. Common tasks include classification, where we we predict discrete categories, and regression, where we predict uh continuous values. Examples include like spam detection, medical diagnosis, and house price prediction.",
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
            "Unsupervised learning works with um unlabeled data, discovering hidden structure and and patterns. Clustering algorithms like group similar data points together, while dimensionality reduction techniques compress high-dimensional data into into lower-dimensional representations. These techniques are are invaluable for exploratory data analysis and feature engineering.",
          chunkId: "youtube-en-ml-chunk-2",
        },
        {
          content:
            "Reinforcement learning takes a a different approach entirely. An agent interacts with an environment, taking actions and receiving um rewards or penalties. Over time, the the agent learns a policy that maximizes cumulative reward. This paradigm you know powers game-playing AIs, robotics control systems, and recommendation engines that adapt to user behavior in real time.",
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
            "The the training process involves splitting data into um training, validation, and test sets. We fit the model on training data, tune hyperparameters using like validation data, and evaluate final performance on the held-out test set. Cross-validation provides you know more robust estimates by rotating which subset serves as the validation set. Overfitting occurs when a model memorizes like memorizes training data rather than learning generalizable patterns.",
          chunkId: "youtube-en-ml-chunk-4",
        },
      ],
    },
  ],
};
