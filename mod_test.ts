import { test } from "node:test";
import assert from "node:assert/strict";
import { WAservix, WAservixError, verifyWebhook } from "./mod.ts";

type Seen = { method: string; url: string; headers: Headers; body: any };

function client(reply: { status?: number; body?: string } = {}) {
  const seen: Seen[] = [];
  const wa = new WAservix({
    apiKey: "wpk_test",
    baseUrl: "https://example.test/api",
    fetch: (async (url: string, init: RequestInit) => {
      seen.push({
        method: String(init.method),
        url: String(url),
        headers: new Headers(init.headers),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(reply.body ?? '{"success":true,"data":{"msgId":58213,"status":"in_progress"}}', {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  return { wa, last: () => seen[seen.length - 1] };
}

test("sendText", async () => {
  const { wa, last } = client();
  const res = await wa.sendText("+1555", "hi");
  assert.equal(res.msgId, 58213);
  assert.equal(last().url, "https://example.test/api/send-message");
  assert.equal(last().headers.get("authorization"), "Bearer wpk_test");
  assert.deepEqual(last().body, { to: "+1555", text: "hi" });
});

test("media and paths", async () => {
  const { wa, last } = client();
  await wa.sendImage("+1", "https://x/y.jpg");
  assert.deepEqual(last().body, { to: "+1", imageUrl: "https://x/y.jpg" });
  await wa.sendDocument("+1", "https://x/a.pdf", "a.pdf", "c");
  assert.equal(last().body.fileName, "a.pdf");
  assert.equal(last().body.text, "c");
  await wa.sendLocation("+1", -1.9441, 30.0619, "Shop");
  assert.equal(last().body.location.name, "Shop");
  await wa.getMessageInfo(5);
  assert.equal(last().url, "https://example.test/api/messages/5/info");
  await wa.editMessage(5, "t");
  assert.equal(last().method, "PUT");
  await wa.onWhatsApp("+1555");
  assert.equal(last().url, "https://example.test/api/on-whatsapp/%2B1555");
  await wa.getGroupMetadata("1203@g.us");
  assert.equal(last().url, "https://example.test/api/groups/1203%40g.us/metadata");
  await wa.connectSession(3);
  assert.deepEqual(last().body, { method: "qr" });
  await wa.connectSession(3, { method: "code", phone: "+1555" });
  assert.deepEqual(last().body, { method: "code", phone: "+1555" });
  await assert.rejects(wa.sendText("", "x"), TypeError);
});

test("API errors", async () => {
  const down = client({ status: 503, body: '{"success":false,"message":"Device reconnecting"}' });
  const err = await down.wa.getStatus().catch((e) => e);
  assert.ok(err instanceof WAservixError);
  assert.equal(err.status, 503);
  assert.equal(err.message, "Device reconnecting");

  const soft = client({ body: '{"success":false,"message":"Invalid number"}' });
  const err2 = await soft.wa.sendText("+1", "x").catch((e) => e);
  assert.equal(err2.message, "Invalid number");
  assert.throws(() => new WAservix({ apiKey: "" }), TypeError);
});

test("verifyWebhook", () => {
  assert.equal(verifyWebhook("abc", "abc"), true);
  assert.equal(verifyWebhook("abd", "abc"), false);
  assert.equal(verifyWebhook("abcd", "abc"), false);
  assert.equal(verifyWebhook(null, "abc"), false);
});
