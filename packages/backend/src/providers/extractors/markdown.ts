import type { ContentExtractor, ExtractResult } from "../types";

interface MarkdownNewResponse {
  success: boolean;
  url: string;
  title?: string;
  content: string;
  method: string;
  duration_ms: number;
  tokens: number;
}

export class MarkdownNewArticleExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    const response = await fetch("https://markdown.new/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, method: "auto" }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Article extraction failed (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const data = (await response.json()) as MarkdownNewResponse;
    if (!data.content?.trim()) {
      throw new Error("Article extraction returned empty content");
    }

    return {
      markdown: data.content.trim(),
      title: data.title,
    };
  }
}

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

export class StubArticleExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      markdown: STUB_ARTICLE_MARKDOWN,
      title: `Stub Article from ${new URL(url).hostname}`,
    };
  }
}
