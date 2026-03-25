import type { FixtureDocument } from "./types";

export const ARTICLE_EN_ARCHITECTURE: FixtureDocument = {
  title: "Understanding Software Architecture Patterns",
  language: "en",
  sections: [
    {
      sectionTitle: "Layered Architecture",
      sectionSummary:
        "The layered architecture organizes code into horizontal layers (presentation, business logic, data access). Each layer only communicates with the layer below, enforcing separation of concerns. Works well for enterprise apps but can lead to the sinkhole anti-pattern.",
      chunks: [
        {
          content:
            "The layered architecture pattern organizes code into horizontal layers, each with a specific responsibility. The most common layers are presentation, business logic, and data access. Each layer only communicates with the layer directly below it, which enforces separation of concerns and makes the system easier to test and maintain.",
          chunkId: "article-en-arch-chunk-0",
        },
        {
          content:
            'This pattern works well for traditional enterprise applications where the domain is well-understood and the team structure maps cleanly to the layers. However, it can lead to the "sinkhole anti-pattern" where requests pass through multiple layers without any meaningful transformation.',
          chunkId: "article-en-arch-chunk-1",
        },
      ],
    },
    {
      sectionTitle: "Event-Driven Architecture",
      sectionSummary:
        "Event-driven architecture uses events for communication between decoupled services. Message brokers like Kafka or RabbitMQ provide durability, ordering, and backpressure. Event sourcing stores every state change as an immutable event.",
      chunks: [
        {
          content:
            "Event-driven architecture uses events to trigger and communicate between decoupled services. Producers emit events without knowing who will consume them, and consumers react to events without knowing who produced them. This loose coupling makes it easier to add new features without modifying existing code.",
          chunkId: "article-en-arch-chunk-2",
        },
        {
          content:
            "Message brokers like Kafka or RabbitMQ sit between producers and consumers, providing durability, ordering guarantees, and backpressure handling. Event sourcing takes this further by storing every state change as an immutable event, enabling full audit trails and temporal queries.",
          chunkId: "article-en-arch-chunk-3",
        },
      ],
    },
    {
      sectionTitle: "Microservices",
      sectionSummary:
        "Microservices decompose systems into independently deployable services with their own data stores. Conway's Law means microservices work best when team boundaries align with service boundaries. Requires distributed tracing, service discovery, and circuit breakers.",
      chunks: [
        {
          content:
            "Microservices decompose a system into small, independently deployable services, each owning its own data store. Teams can choose different technologies for different services and deploy them on independent schedules. This autonomy comes at the cost of operational complexity: distributed tracing, service discovery, and circuit breakers become essential infrastructure.",
          chunkId: "article-en-arch-chunk-4",
        },
        {
          content:
            "The key insight is that microservices are an organizational pattern, not just a technical one. Conway's Law tells us that system architecture mirrors communication structures, so microservices work best when team boundaries align with service boundaries.",
          chunkId: "article-en-arch-chunk-5",
        },
      ],
    },
  ],
};
