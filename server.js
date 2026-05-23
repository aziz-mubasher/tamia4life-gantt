import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3847;
const BOARDS_DIR = join(__dirname, "data", "boards");
const LEGACY_FILE = join(__dirname, "data", "saved-data.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function sanitizeBoardId(id) {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function boardFile(id) {
  return join(BOARDS_DIR, `${sanitizeBoardId(id)}.json`);
}

function wrapPayload(data) {
  return {
    data,
    updatedAt: new Date().toISOString(),
  };
}

async function readBoard(id) {
  const file = boardFile(id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (_) {
    return null;
  }
}

async function writeBoard(id, data) {
  await mkdir(BOARDS_DIR, { recursive: true });
  const payload = wrapPayload(data);
  await writeFile(boardFile(id), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  const boardMatch = url.pathname.match(/^\/api\/boards\/([^/]+)$/);
  if (boardMatch) {
    const boardId = sanitizeBoardId(decodeURIComponent(boardMatch[1]));
    if (!boardId) {
      json(res, 400, { error: "invalid board id" });
      return;
    }

    if (req.method === "GET") {
      const payload = await readBoard(boardId);
      if (!payload?.data) {
        json(res, 404, { error: "board not found" });
        return;
      }
      json(res, 200, payload);
      return;
    }

    if (req.method === "PUT") {
      try {
        const data = JSON.parse(await readBody(req));
        if (!Array.isArray(data.tasks) || !Array.isArray(data.phases)) {
          json(res, 400, { error: "invalid roadmap data" });
          return;
        }
        const payload = await writeBoard(boardId, data);
        json(res, 200, payload);
      } catch (_) {
        json(res, 400, { error: "invalid json" });
      }
      return;
    }
  }

  if (url.pathname === "/api/data") {
    if (req.method === "GET") {
      let payload = null;
      if (existsSync(LEGACY_FILE)) {
        try {
          const data = JSON.parse(await readFile(LEGACY_FILE, "utf8"));
          payload = wrapPayload(data);
        } catch (_) {
          payload = null;
        }
      }
      json(res, payload ? 200 : 404, payload || { error: "not found" });
      return;
    }

    if (req.method === "PUT") {
      try {
        const data = JSON.parse(await readBody(req));
        await mkdir(join(__dirname, "data"), { recursive: true });
        await writeFile(LEGACY_FILE, JSON.stringify(data, null, 2), "utf8");
        json(res, 200, wrapPayload(data));
      } catch (_) {
        json(res, 400, { error: "invalid json" });
      }
      return;
    }
  }

  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(__dirname, decodeURIComponent(rel));

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch (_) {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`AZM Lean Startup Road Map running on port ${PORT}`);
  console.log(`Shared boards stored in ${BOARDS_DIR}`);
});
