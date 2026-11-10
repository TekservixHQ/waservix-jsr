/**
 * TypeScript client for the [WAservix WhatsApp API Gateway](https://tekservix.com/waservix/).
 * Works in Deno, Bun, Node.js 18+ and edge runtimes (Cloudflare Workers, Deno Deploy, Vercel Edge).
 *
 * WAservix links your own WhatsApp number by QR code (the same way WhatsApp Web does) and
 * gives you a REST API to send text, images, documents, locations, polls and more.
 *
 * @example Send a WhatsApp message
 * ```ts
 * import { WAservix } from "@tekservix/waservix";
 *
 * const wa = new WAservix({ apiKey: Deno.env.get("WASERVIX_KEY")! });
 * const res = await wa.sendText("+15551234567", "Hello Aline, your order is ready");
 * console.log(res.msgId, res.status); // 58213 "in_progress"
 * ```
 *
 * Keep the API key on your server. API reference: https://tekservix.com/waservix/docs/
 *
 * @module
 */

/** Package version, sent in the User-Agent header. */
export const VERSION = "1.0.0";

/** Production API base URL. */
export const DEFAULT_BASE_URL = "https://tekservix.com/waservix/api";

/** A decoded JSON object returned by the API. */
// deno-lint-ignore no-explicit-any
export type JsonObject = Record<string, any>;

/** Options for {@link WAservix}. */
export interface WAservixOptions {
  /** Device API key (Devices -> API key), or a personal access token for session management. */
  apiKey: string;
  /** Change only for testing. */
  baseUrl?: string;
  /** Request timeout in milliseconds (default 30000). */
  timeout?: number;
  /** Custom fetch (tests, proxies, logging). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** Fields for {@link WAservix.sendMessage}, named as in the API. */
export interface SendMessageParams {
  /** International phone number or group JID (`...@g.us`). */
  to: string;
  /** Text, or the caption for media. */
  text?: string;
  /** Image URL. */
  imageUrl?: string;
  /** Video URL. */
  videoUrl?: string;
  /** Audio URL. */
  audioUrl?: string;
  /** Document URL. */
  documentUrl?: string;
  /** File name shown for documents. */
  fileName?: string;
  /** Sticker URL. */
  stickerUrl?: string;
  /** Contact card. */
  contact?: JsonObject;
  /** Location pin, e.g. `{ latitude, longitude, name }`. */
  location?: JsonObject;
  /** Poll, e.g. `{ name, options: [...] }`. */
  poll?: JsonObject;
  /** Message ID to reply to. */
  replyTo?: string;
  /** Numbers to mention in a group. */
  mentions?: string[];
  /** Send as view once. */
  viewOnce?: boolean;
  /** Any other documented field. */
  [key: string]: unknown;
}

/** Answer of the send methods. Messages are queued, so status starts as `in_progress`. */
export interface SendResult extends JsonObject {
  /** Message ID for status checks. */
  msgId: number;
  /** WhatsApp JID of the recipient. */
  jid: string;
  /** `in_progress` right after sending. */
  status: string;
}

/** Thrown when the API answers with an error. A 503 means the device is reconnecting: retry shortly. */
export class WAservixError extends Error {
  /** HTTP status (0 when the request never reached the API). */
  status: number;
  /** Field errors, when the API sends them. */
  errors?: Record<string, string[]>;
  /** Parsed JSON body, or the raw text when it was not JSON. */
  body?: unknown;
  /** Seconds to wait before retrying (sent with 429). */
  retryAfter?: number;

  /** Creates an API error. */
  constructor(
    message: string,
    init: { status: number; errors?: Record<string, string[]>; body?: unknown; retryAfter?: number },
  ) {
    super(message);
    this.name = "WAservixError";
    this.status = init.status;
    this.errors = init.errors;
    this.body = init.body;
    this.retryAfter = init.retryAfter;
  }
}

/** WAservix API client. Reuse one instance per app. */
export class WAservix {
  /** Base URL in use. */
  readonly baseUrl: string;
  #apiKey: string;
  #timeout: number;
  #fetch: typeof fetch;

  /** Creates a client. */
  constructor(options: WAservixOptions) {
    if (!options?.apiKey) {
      throw new TypeError("WAservix: apiKey is required (Devices -> API key in the WAservix dashboard)");
    }
    this.#apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#timeout = options.timeout ?? 30_000;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Call any documented endpoint, e.g. `request("GET", "/groups")`. Returns the `data` field. */
  // deno-lint-ignore no-explicit-any
  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.#apiKey}`,
      "Accept": "application/json",
      "User-Agent": `waservix-jsr/${VERSION}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await this.#fetch(this.baseUrl + path, {
        method: method.toUpperCase(),
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeout),
      });
    } catch (err) {
      throw new WAservixError(`WAservix: request failed (${(err as Error).message})`, { status: 0 });
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    const obj = json && typeof json === "object" && !Array.isArray(json) ? json as JsonObject : undefined;

    if (!res.ok || obj?.success === false) {
      const retry = res.headers.get("retry-after");
      throw new WAservixError(typeof obj?.message === "string" ? obj.message : `HTTP ${res.status}`, {
        status: res.status,
        errors: obj?.errors,
        body: json ?? text,
        retryAfter: retry ? Number(retry) : undefined,
      });
    }
    return (obj && "data" in obj ? obj.data : json) as T;
  }

  /** Send any message type to a number or group JID. */
  sendMessage(params: SendMessageParams): Promise<SendResult> {
    if (!params?.to) {
      return Promise.reject(new TypeError('sendMessage: "to" is required (international number or group JID)'));
    }
    const body: JsonObject = {};
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body[k] = v;
    return this.request("POST", "/send-message", body);
  }

  /** Send a text message. */
  sendText(to: string, text: string): Promise<SendResult> {
    return this.sendMessage({ to, text });
  }

  /** Send an image by URL, with an optional caption. */
  sendImage(to: string, imageUrl: string, caption?: string): Promise<SendResult> {
    return this.sendMessage({ to, imageUrl, text: caption });
  }

  /** Send a document by URL. */
  sendDocument(to: string, documentUrl: string, fileName?: string, caption?: string): Promise<SendResult> {
    return this.sendMessage({ to, documentUrl, fileName, text: caption });
  }

  /** Send a location pin. */
  sendLocation(to: string, latitude: number, longitude: number, name?: string): Promise<SendResult> {
    const location: JsonObject = { latitude, longitude };
    if (name !== undefined) location.name = name;
    return this.sendMessage({ to, location });
  }

  /** Status: queued, sent, delivered, read, played or failed. */
  getMessageInfo(id: number | string): Promise<JsonObject> {
    return this.request("GET", `/messages/${enc(id)}/info`);
  }

  /** Edit one of your own text messages (about 15 minutes after sending). */
  editMessage(id: number | string, text: string): Promise<JsonObject> {
    return this.request("PUT", `/messages/${enc(id)}`, { text });
  }

  /** Delete a message. */
  deleteMessage(id: number | string): Promise<JsonObject> {
    return this.request("DELETE", `/messages/${enc(id)}`);
  }

  /** Resend a failed message. */
  resendMessage(id: number | string): Promise<JsonObject> {
    return this.request("POST", `/messages/${enc(id)}/resend`);
  }

  /** Is this number on WhatsApp? */
  onWhatsApp(phone: string): Promise<{ exists: boolean; jid?: string }> {
    return this.request("GET", `/on-whatsapp/${enc(phone)}`);
  }

  /** connected, connecting, need_scan, disconnected, logged_out or expired. */
  getStatus(): Promise<{ status: string }> {
    return this.request("GET", "/status");
  }

  /** The linked WhatsApp account. */
  getUser(): Promise<JsonObject> {
    return this.request("GET", "/user");
  }

  /** Your contacts. */
  listContacts(): Promise<JsonObject[]> {
    return this.request("GET", "/contacts");
  }

  /** One contact. */
  getContact(phone: string): Promise<JsonObject> {
    return this.request("GET", `/contacts/${enc(phone)}`);
  }

  /** Save or rename a contact. */
  saveContact(phone: string, name: string): Promise<JsonObject> {
    return this.request("PUT", "/contacts", { phone, name });
  }

  /** Groups the number belongs to. */
  listGroups(): Promise<JsonObject[]> {
    return this.request("GET", "/groups");
  }

  /** Group name, participants and settings. */
  getGroupMetadata(groupJid: string): Promise<JsonObject> {
    return this.request("GET", `/groups/${enc(groupJid)}/metadata`);
  }

  /** Sessions (need a personal access token, not a device key). */
  listSessions(): Promise<JsonObject[]> {
    return this.request("GET", "/whatsapp-sessions");
  }

  /** One session. */
  getSession(id: number | string): Promise<JsonObject> {
    return this.request("GET", `/whatsapp-sessions/${enc(id)}`);
  }

  /** Create a session. */
  createSession(params: JsonObject): Promise<JsonObject> {
    return this.request("POST", "/whatsapp-sessions", params);
  }

  /** Connect a session by QR code (default) or pairing code. */
  connectSession(
    id: number | string,
    params: { method: "qr" } | { method: "code"; phone: string } = { method: "qr" },
  ): Promise<JsonObject> {
    return this.request("POST", `/whatsapp-sessions/${enc(id)}/connect`, params);
  }

  /** QR code for linking the number. */
  getSessionQrCode(id: number | string): Promise<JsonObject> {
    return this.request("GET", `/whatsapp-sessions/${enc(id)}/qrcode`);
  }
}

/**
 * Constant-time check of the `X-Webhook-Signature` header against your device's webhook secret.
 *
 * @example Deno / Bun / Workers handler
 * ```ts
 * if (!verifyWebhook(req.headers.get("x-webhook-signature"), secret)) {
 *   return new Response("bad signature", { status: 401 });
 * }
 * ```
 */
export function verifyWebhook(signature: string | null | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(signature), b = encoder.encode(secret);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function enc(value: number | string): string {
  return encodeURIComponent(String(value));
}

export default WAservix;
