import http from "node:http";
import { createGenerationStream, toErrorResponse } from "./generate.mjs";

const HOST = process.env.LIVE_AGENT_API_HOST || "127.0.0.1";
const PORT = Number(process.env.LIVE_AGENT_API_PORT || 5174);
const MAX_BODY_BYTES = 1_000_000;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendNotFound(res) {
  sendJson(res, 404, {
    error: "not_found",
    message: "Route not found.",
  });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

async function pipeReadableStream(stream, res, signal) {
  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream) {
      if (signal.aborted) break;
      res.write(typeof chunk === "string" ? chunk : Buffer.from(chunk));
    }
    res.end();
    return;
  }

  const reader = stream.getReader();
  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      res.write(typeof value === "string" ? value : Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

async function handleGenerate(req, res) {
  const controller = new AbortController();
  req.on("aborted", () => {
    controller.abort();
  });
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const body = await readJsonBody(req);
    const { stream, contentType } = await createGenerationStream(body, {
      signal: controller.signal,
    });

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });

    await pipeReadableStream(stream, res, controller.signal);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    if (error?.status === 400) {
      sendJson(res, 400, {
        error: "invalid_request",
        message: error.message,
      });
      return;
    }

    if (error?.status === 413) {
      sendJson(res, 413, {
        error: "invalid_request",
        message: error.message,
      });
      return;
    }

    const response = toErrorResponse(error);
    sendJson(res, response.status, response.body);
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === "POST" && url.pathname === "/api/generate") {
    void handleGenerate(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  sendNotFound(res);
});

server.listen(PORT, HOST, () => {
  console.log(`live-agent API listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
