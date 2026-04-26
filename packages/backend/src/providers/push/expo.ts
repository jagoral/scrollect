import type { PushNotificationMessage, PushNotificationService, PushSendOutcome } from "../types";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/**
 * Expo Push API has a per-request limit of 100 messages. Splitting larger lists keeps
 * the adapter usable for fan-out scenarios (e.g. one user with multiple devices) without
 * leaking the limit into call sites.
 */
const MAX_BATCH_SIZE = 100;

const PERMANENT_FAILURE_CODES = new Set(["DeviceNotRegistered", "InvalidCredentials"]);

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoSendResponse {
  data?: ExpoTicket[];
  errors?: Array<{ message: string; code?: string }>;
}

export interface ExpoPushClientOptions {
  /**
   * Optional Expo access token. Required only for projects that have enabled enhanced
   * security on the Expo dashboard. Most projects send unauthenticated pushes.
   */
  accessToken?: string;
}

export class ExpoPushClient implements PushNotificationService {
  private accessToken?: string;

  constructor(opts: ExpoPushClientOptions = {}) {
    this.accessToken = opts.accessToken;
  }

  async send(messages: PushNotificationMessage[]): Promise<PushSendOutcome[]> {
    if (messages.length === 0) return [];

    const outcomes: PushSendOutcome[] = [];
    for (let start = 0; start < messages.length; start += MAX_BATCH_SIZE) {
      const batch = messages.slice(start, start + MAX_BATCH_SIZE);
      const batchOutcomes = await this.sendBatch(batch);
      outcomes.push(...batchOutcomes);
    }
    return outcomes;
  }

  private async sendBatch(messages: PushNotificationMessage[]): Promise<PushSendOutcome[]> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(
          messages.map((m) => ({
            to: m.token,
            title: m.title,
            body: m.body,
            data: m.data,
            sound: "default",
            priority: "high",
          })),
        ),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return messages.map(() => ({ status: "error" as const, reason }));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const reason = `Expo push HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
      return messages.map(() => ({ status: "error" as const, reason }));
    }

    const body = (await response.json().catch(() => ({}))) as ExpoSendResponse;
    if (!body.data || body.data.length !== messages.length) {
      return messages.map(() => ({
        status: "error" as const,
        reason: body.errors?.[0]?.message ?? "Malformed Expo push response",
      }));
    }

    return body.data.map((ticket) => mapTicket(ticket));
  }
}

function mapTicket(ticket: ExpoTicket): PushSendOutcome {
  if (ticket.status === "ok") {
    return { status: "ok", receiptId: ticket.id };
  }
  const code = ticket.details?.error;
  if (code && PERMANENT_FAILURE_CODES.has(code)) {
    return { status: "invalid_token", reason: code };
  }
  return { status: "error", reason: ticket.message ?? code ?? "unknown" };
}

/**
 * No-op push client. Used when Expo push isn't configured (local dev / CI) so the
 * notifier can run without external dependencies. Treats every send as successful so
 * callers don't fall into the invalid-token cleanup path.
 */
export class StubPushClient implements PushNotificationService {
  async send(messages: PushNotificationMessage[]): Promise<PushSendOutcome[]> {
    return messages.map(() => ({ status: "ok" as const }));
  }
}
