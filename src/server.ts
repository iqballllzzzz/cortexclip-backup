import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// TanStack Start membalas 500 untuk request yang Accept-nya bukan text/html
// (mis. Accept: application/json atau text/event-stream — dipakai bot/monitor
// dan probe MCP). Itu bukan error server: kita tidak bisa memenuhi tipe yang
// diminta, jadi jawaban yang benar 406, bukan 5xx. Kalau dibiarkan 500,
// monitoring eksternal & QA membaca situs "rusak" padahal sehat.
const HTML_ONLY_MARKER = "Only HTML requests are supported here";

async function normalizeUnsupportedAcceptResponse(response: Response): Promise<Response> {
  if (response.status !== 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes(HTML_ONLY_MARKER)) return response;

  return new Response(
    JSON.stringify({
      error: "Not Acceptable",
      detail: "Endpoint ini hanya melayani HTML. Kirim Accept: text/html.",
    }),
    { status: 406, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

// Request HEAD tidak pernah dibaca body-nya oleh layer HTTP, jadi stream SSR
// TanStack tidak ada yang men-drain: read loop-nya nyangkut di backpressure
// sampai safety-net 120s kebakar ("SSR stream transform exceeded maximum
// lifetime"). Efeknya tiap HEAD menahan render React + timer selama 2 menit —
// uptime monitor / bot yang pakai HEAD bisa numpuk stream sampai server sesak.
// Solusi: render seperti GET, habiskan body-nya di sini supaya stream tutup
// normal, lalu balas tanpa body (sesuai semantik HEAD).
const HEAD_DRAIN_MAX_BYTES = 8 * 1024 * 1024;

async function drainResponseBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength ?? 0;
      if (total > HEAD_DRAIN_MAX_BYTES) {
        await reader.cancel("head-drain-limit");
        break;
      }
    }
  } catch {
    // body rusak/di-abort: tidak ada yang bisa/perlu dilakukan untuk HEAD
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // sudah dilepas saat cancel
    }
  }
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

async function handleHeadRequest(
  handler: ServerEntry,
  request: Request,
  env: unknown,
  ctx: unknown,
): Promise<Response> {
  // Render sebagai GET supaya kita pegang body-nya dan bisa men-drain sampai
  // habis — stream SSR baru menutup diri dan timer 120s-nya ikut dibersihkan.
  const getRequest = new Request(request.url, {
    method: "GET",
    headers: request.headers,
    redirect: "manual",
  });

  const response = await handler.fetch(getRequest, env, ctx);
  const normalized = await normalizeUnsupportedAcceptResponse(response);
  const finalResponse = await normalizeCatastrophicSsrResponse(normalized);

  await drainResponseBody(finalResponse.body);

  return new Response(null, {
    status: finalResponse.status,
    statusText: finalResponse.statusText,
    headers: finalResponse.headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      if (request.method === "HEAD") {
        return await handleHeadRequest(handler, request, env, ctx);
      }
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeUnsupportedAcceptResponse(response);
      return await normalizeCatastrophicSsrResponse(normalized);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
