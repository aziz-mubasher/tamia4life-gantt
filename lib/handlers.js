import {
  isValidRoadmap,
  readBoard,
  writeBoard,
  readLegacyData,
  writeLegacyData,
  sanitizeBoardId,
  storageMode,
  storageLabel,
} from "./storage.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  cors(res);
  res.status(status).json(body);
}

async function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8"));
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export async function handleHealth(_req, res) {
  json(res, 200, {
    ok: true,
    app: "azm-lean-startup-roadmap",
    storage: storageMode(),
    storageLabel: storageLabel(),
  });
}

export async function handleData(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    const payload = await readLegacyData();
    if (!payload?.data) {
      json(res, 404, { error: "not found" });
      return;
    }
    json(res, 200, payload);
    return;
  }

  if (req.method === "PUT") {
    try {
      const data = await readJsonBody(req);
      if (!isValidRoadmap(data)) {
        json(res, 400, { error: "invalid roadmap data" });
        return;
      }
      const payload = await writeLegacyData(data);
      json(res, 200, payload);
    } catch (err) {
      json(res, 400, { error: "save failed", message: err?.message || String(err) });
    }
    return;
  }

  json(res, 405, { error: "method not allowed" });
}

export async function handleBoard(req, res, boardIdRaw) {
  if (req.method === "OPTIONS") {
    cors(res);
    res.status(204).end();
    return;
  }

  const boardId = sanitizeBoardId(boardIdRaw);
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
      const data = await readJsonBody(req);
      if (!isValidRoadmap(data)) {
        json(res, 400, { error: "invalid roadmap data" });
        return;
      }
      const payload = await writeBoard(boardId, data);
      json(res, 200, payload);
    } catch (err) {
      json(res, 400, { error: "save failed", message: err?.message || String(err) });
    }
    return;
  }

  json(res, 405, { error: "method not allowed" });
}
