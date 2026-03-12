import type { ContentExtractor, ExtractResult } from "./types";

const STUB_ARTICLE_MARKDOWN = `# Understanding Software Architecture Patterns

Software architecture is the high-level structure of a software system. It defines how
components are organized, how they communicate, and how they evolve over time. Good
architecture enables teams to move fast without breaking things.

## Layered Architecture

The layered architecture pattern organizes code into horizontal layers, each with a
specific responsibility. The most common layers are presentation, business logic, and
data access. Each layer only communicates with the layer directly below it, which
enforces separation of concerns and makes the system easier to test and maintain.

This pattern works well for traditional enterprise applications where the domain is
well-understood and the team structure maps cleanly to the layers. However, it can
lead to the "sinkhole anti-pattern" where requests pass through multiple layers
without any meaningful transformation.

## Event-Driven Architecture

Event-driven architecture uses events to trigger and communicate between decoupled
services. Producers emit events without knowing who will consume them, and consumers
react to events without knowing who produced them. This loose coupling makes it
easier to add new features without modifying existing code.

Message brokers like Kafka or RabbitMQ sit between producers and consumers, providing
durability, ordering guarantees, and backpressure handling. Event sourcing takes this
further by storing every state change as an immutable event, enabling full audit trails
and temporal queries.

## Microservices

Microservices decompose a system into small, independently deployable services, each
owning its own data store. Teams can choose different technologies for different
services and deploy them on independent schedules. This autonomy comes at the cost of
operational complexity: distributed tracing, service discovery, and circuit breakers
become essential infrastructure.

The key insight is that microservices are an organizational pattern, not just a
technical one. Conway's Law tells us that system architecture mirrors communication
structures, so microservices work best when team boundaries align with service
boundaries.

## Conclusion

There is no single "best" architecture. The right choice depends on team size, domain
complexity, scalability requirements, and organizational structure. Start simple, measure
what matters, and evolve the architecture as requirements become clearer.`;

const STUB_YOUTUBE_MARKDOWN = `# Introduction to Machine Learning Fundamentals

## [0:00]
Welcome to this comprehensive introduction to machine learning. Today we will cover
the fundamental concepts that every practitioner needs to understand. Machine learning
is transforming industries from healthcare to finance to transportation, and
understanding the basics is essential for anyone working in technology today.

## [1:00]
Machine learning is a subset of artificial intelligence where systems learn from data
rather than being explicitly programmed. Instead of writing rules by hand, we provide
examples and let algorithms discover patterns automatically. This paradigm shift has
enabled breakthroughs in image recognition, natural language processing, and
recommendation systems that would have been impossible with traditional programming.

## [2:00]
There are three main categories of machine learning. Supervised learning uses labeled
training data to learn a mapping from inputs to outputs. Common tasks include
classification, where we predict discrete categories, and regression, where we predict
continuous values. Examples include spam detection, medical diagnosis, and house price
prediction.

## [3:00]
Unsupervised learning works with unlabeled data, discovering hidden structure and
patterns. Clustering algorithms group similar data points together, while dimensionality
reduction techniques compress high-dimensional data into lower-dimensional
representations. These techniques are invaluable for exploratory data analysis and
feature engineering.

## [4:00]
Reinforcement learning takes a different approach entirely. An agent interacts with an
environment, taking actions and receiving rewards or penalties. Over time, the agent
learns a policy that maximizes cumulative reward. This paradigm powers game-playing AIs,
robotics control systems, and recommendation engines that adapt to user behavior in
real time.

## [5:00]
The training process involves splitting data into training, validation, and test sets.
We fit the model on training data, tune hyperparameters using validation data, and
evaluate final performance on the held-out test set. Cross-validation provides more
robust estimates by rotating which subset serves as the validation set. Overfitting
occurs when a model memorizes training data rather than learning generalizable patterns.

## [6:00]
Thank you for watching this introduction to machine learning. In the next video, we
will dive deeper into neural networks and deep learning architectures, exploring how
multi-layer perceptrons, convolutional networks, and transformers have revolutionized
the field. Subscribe and hit the bell icon to be notified when it drops.`;

export class StubArticleExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      markdown: STUB_ARTICLE_MARKDOWN,
      title: `Stub Article from ${new URL(url).hostname}`,
    };
  }
}

export class StubYouTubeExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? "unknown";
    return {
      markdown: STUB_YOUTUBE_MARKDOWN,
      title: `Stub YouTube Video (${videoId})`,
      metadata: { provider: "stub" },
    };
  }
}
