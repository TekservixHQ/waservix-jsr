# @tekservix/waservix

[![JSR](https://jsr.io/badges/@tekservix/waservix)](https://jsr.io/@tekservix/waservix)
[![JSR Score](https://jsr.io/badges/@tekservix/waservix/score)](https://jsr.io/@tekservix/waservix)
[![tests](https://github.com/TekservixHQ/waservix-jsr/actions/workflows/tests.yml/badge.svg)](https://github.com/TekservixHQ/waservix-jsr/actions/workflows/tests.yml)

TypeScript client for the [WAservix WhatsApp API Gateway](https://tekservix.com/waservix/), for Deno, Bun, Node.js and edge runtimes.

WAservix links your own WhatsApp number by QR code (the same way WhatsApp Web does) and gives you a REST API to send text, images, video, audio, documents, locations, polls and more, with webhooks for incoming messages and status updates.

- Written in TypeScript, uses only web standards (`fetch`)
- Runs on Deno, Deno Deploy, Bun, Node.js 18+, Cloudflare Workers and Vercel Edge
- No dependencies; webhook check built in

## Install

```bash
deno add jsr:@tekservix/waservix
npx jsr add @tekservix/waservix    # Node.js
bunx jsr add @tekservix/waservix   # Bun
```

## Quick start

Copy your device's API key from the WAservix dashboard (Devices -> API key) and keep it on your server.

```ts
import { WAservix } from "@tekservix/waservix";

const wa = new WAservix({ apiKey: Deno.env.get("WASERVIX_KEY")! }); // process.env.WASERVIX_KEY on Node/Bun

const res = await wa.sendText("+15551234567", "Hello Aline, your order is ready");
console.log(res.msgId, res.status); // 58213 "in_progress"
```

## Sending

Messages are queued and sent one at a time per number, so each call returns right away with `status: "in_progress"` and a `msgId`.

```ts
// Image with caption
await wa.sendImage("+15551234567", "https://example.com/product.jpg", "Back in stock");

// Document
await wa.sendDocument("+15551234567", "https://example.com/inv-1042.pdf", "Invoice-1042.pdf", "Your invoice");

// Location
await wa.sendLocation("+15551234567", -1.9441, 30.0619, "Our shop");

// Anything the API supports, including groups (JID ending in @g.us)
await wa.sendMessage({ to: "120363040000000000@g.us", text: "Team meeting at 3pm" });
await wa.sendMessage({ to: "+15551234567", poll: { name: "Lunch?", options: ["Pizza", "Sushi"] } });
```

## Status, contacts and groups

```ts
const info = await wa.getMessageInfo(58213);      // queued, sent, delivered, read, played or failed
const check = await wa.onWhatsApp("+15551234567"); // { exists: true, jid: "..." }
const conn = await wa.getStatus();                // { status: "connected" }

await wa.editMessage(58213, "Corrected text");    // own text messages, about 15 minutes
const groups = await wa.listGroups();
```

Anything else in the [API reference](https://tekservix.com/waservix/docs/) is one call away:

```ts
await wa.request("POST", "/messages/read", { msgId: "3EB0X123456789" });
```

## Webhooks

Set a webhook URL and events for the number in the dashboard. Each request carries `X-Webhook-Signature`, which equals the device's webhook secret. Deno example (the same handler works in Bun and Cloudflare Workers):

```ts
import { verifyWebhook } from "@tekservix/waservix";

Deno.serve(async (req) => {
  if (!verifyWebhook(req.headers.get("x-webhook-signature"), Deno.env.get("WASERVIX_WEBHOOK_SECRET")!)) {
    return new Response("bad signature", { status: 401 });
  }
  const payload = await req.json();
  if (payload.event === "messages.received") {
    const m = payload.data.messages;
    // m.key.cleanedSenderPn, m.messageBody: queue slow work, answer fast
  }
  return new Response("ok");
});
```

## Errors

Failed calls throw `WAservixError` with `status`, `message`, field `errors` and, on 429, `retryAfter` in seconds. A 503 means the device is reconnecting: retry shortly.

Never put the key in browser code or a mobile app: anyone could read it. Call the API from your server or an edge function.

## Migrating from WaSender

WAservix accepts the same `/send-message` body and webhook fields as WaSender, so most integrations switch by changing the base URL and key. See the [compatibility notes](https://tekservix.com/waservix/docs/).

## Use it responsibly

WAservix is not Meta's official WhatsApp Business Platform. There's no business verification and no per-conversation fee, but WhatsApp's spam rules apply to your number directly. Message people who expect to hear from you, warm up new numbers slowly and keep the built-in account protection on.

## More from Tekservix

- [SMS Gora SMS Gateway](https://tekservix.com/smsgora/): send SMS through your own Android phones ([`jsr:@tekservix/smsgora`](https://jsr.io/@tekservix/smsgora))
- [AI Sales Agent](https://tekservix.com/ai-sales-agent): answers customers on WhatsApp and SMS using your website's content
- [Website to App](https://tekservix.com/mobile-apps): turn your website into Android and iOS apps
- WAservix is also on npm, PyPI, Packagist, Go, Maven (JitPack), NuGet, RubyGems, Swift, crates.io and pub.dev: see [github.com/TekservixHQ](https://github.com/TekservixHQ)

## License

MIT
