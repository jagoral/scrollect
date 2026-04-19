export type MarkerJobResult =
  | { kind: "submitted"; jobId: string }
  | { kind: "immediate"; markdown: string };

export interface RunPodJobStatus {
  executionTimeMs: number;
  delayTimeMs: number;
}

export interface MarkerClient {
  submitJob(opts: {
    fileUrl: string;
    documentId: string;
    fileType: string;
    webhookUrl: string;
  }): Promise<MarkerJobResult>;

  getJobStatus?(jobId: string): Promise<RunPodJobStatus | null>;
}

export class RunPodMarkerClient implements MarkerClient {
  private endpointId: string;
  private apiKey: string;

  constructor(opts: { endpointId: string; apiKey: string }) {
    this.endpointId = opts.endpointId;
    this.apiKey = opts.apiKey;
  }

  async submitJob(opts: {
    fileUrl: string;
    documentId: string;
    fileType: string;
    webhookUrl: string;
  }): Promise<MarkerJobResult> {
    const response = await fetch(`https://api.runpod.ai/v2/${this.endpointId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: {
          file_url: opts.fileUrl,
          document_id: opts.documentId,
          file_type: opts.fileType,
        },
        webhook: opts.webhookUrl,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RunPod submit failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { id?: string };
    if (!data.id) {
      throw new Error(`RunPod submit failed: no job ID in response`);
    }

    return { kind: "submitted", jobId: data.id };
  }

  async getJobStatus(jobId: string): Promise<RunPodJobStatus | null> {
    const response = await fetch(`https://api.runpod.ai/v2/${this.endpointId}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      executionTime?: number;
      delayTime?: number;
    };

    return {
      executionTimeMs: data.executionTime ?? 0,
      delayTimeMs: data.delayTime ?? 0,
    };
  }
}

const STUB_DOCUMENT_MARKDOWN = `# The Art of Effective Learning

Learning is not a passive process. Research in cognitive science has shown that active
engagement with material leads to dramatically better retention and understanding than
simply re-reading or highlighting text.

## Spaced Repetition

Spaced repetition is a learning technique that involves reviewing information at
gradually increasing intervals. This approach exploits the spacing effect, a phenomenon
where our brains form stronger memories when exposure to information is spread out
over time rather than concentrated in a single session.

## Active Recall

Active recall is the practice of actively stimulating memory during the learning
process. Rather than passively reviewing notes, you close the book and try to recall
the key points from memory.

## Conclusion

The most effective learning combines spaced repetition, active recall, and interleaving
into a coherent system.`;

export class StubMarkerClient implements MarkerClient {
  async submitJob(_opts: {
    fileUrl: string;
    documentId: string;
    fileType: string;
    webhookUrl: string;
  }): Promise<MarkerJobResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { kind: "immediate", markdown: STUB_DOCUMENT_MARKDOWN };
  }
}
