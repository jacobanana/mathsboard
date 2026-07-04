// The board API: a tiny same-origin service that does the three things the
// static frontend can't do itself.
//
//   POST /api/token   - mint a per-document Y-Sweet client token. The Y-Sweet
//                       CONNECTION STRING (the server's root credential) lives
//                       only in this process's env and never reaches a browser;
//                       clients get short-scoped per-board tokens instead.
//   POST /api/upload  - stream an image into the S3 bucket, return its URL.
//   GET  /api/img/:key- serve an uploaded image back out of the bucket, so
//                       image URLs stay same-origin (no bucket CORS, no public
//                       bucket policy needed).
//
// Sits behind Caddy, which routes /api/* here and terminates TLS.

import crypto from "node:crypto";
import express from "express";
import { DocumentManager } from "@y-sweet/sdk";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

const PORT = Number(process.env.PORT ?? 8787);
// Baked into the image at CI build time (see .github/actions/app-version); "dev"
// for a local/unversioned run.
const VERSION = process.env.APP_VERSION ?? "dev";
const CONNECTION_STRING = requireEnv("YSWEET_CONNECTION_STRING");
const S3_BUCKET = requireEnv("S3_BUCKET");
const ASSET_PREFIX = process.env.S3_ASSET_PREFIX ?? "assets/";

const manager = new DocumentManager(CONNECTION_STRING);

// Credentials/region/endpoint come from the standard AWS_* env vars (shared
// with the y-sweet container). AWS_S3_USE_PATH_STYLE=true is what MinIO and
// most non-AWS S3 providers need.
const s3 = new S3Client({
  forcePathStyle: process.env.AWS_S3_USE_PATH_STYLE === "true",
});

const app = express();
app.disable("x-powered-by");

// Same board-id shape the frontend generates (crypto.randomUUID) and y-sweet
// accepts; rejecting everything else keeps arbitrary strings out of doc ids.
const BOARD_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * Public origin as seen by the browser, from the reverse proxy's forwarded
 * headers. Used to rewrite the websocket/base URLs inside minted tokens:
 * y-sweet's own --url-prefix cannot express a path prefix for the ws URL (its
 * URL join drops the path), so the rewrite happens here, pointing clients at
 * wss://<host>/ys/... which Caddy routes back to the y-sweet container.
 */
function publicOrigin(req) {
  const proto = (req.headers["x-forwarded-proto"] ?? req.protocol ?? "http")
    .split(",")[0]
    .trim();
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "")
    .split(",")[0]
    .trim();
  return { proto, host };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// The frontend fetches this on startup to log the backend build alongside its
// own in the browser console (see src/version.ts).
app.get("/api/version", (_req, res) => {
  res.json({ version: VERSION });
});

// --- token minting -----------------------------------------------------------
// The @y-sweet/client provider POSTs {docId} to its auth endpoint and expects
// a ClientToken JSON back - this is that endpoint.
app.post("/api/token", express.json(), async (req, res) => {
  const docId = req.body?.docId;
  if (typeof docId !== "string" || !BOARD_ID_RE.test(docId)) {
    res.status(400).json({ error: "invalid docId" });
    return;
  }
  try {
    const token = await manager.getOrCreateDocAndToken(docId);
    const { proto, host } = publicOrigin(req);
    if (host) {
      const wsProto = proto === "https" ? "wss" : "ws";
      token.url = `${wsProto}://${host}/ys/d/${docId}/ws`;
      token.baseUrl = `${proto}://${host}/ys/d/${docId}`;
    }
    res.json(token);
  } catch (err) {
    console.error("token minting failed:", err?.message ?? err);
    res.status(502).json({ error: "could not reach the sync server" });
  }
});

// --- image upload / serving ----------------------------------------------------
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_UPLOAD = "8mb";

app.post(
  "/api/upload",
  express.raw({ type: Object.keys(IMAGE_TYPES), limit: MAX_UPLOAD }),
  async (req, res) => {
    const ext = IMAGE_TYPES[req.headers["content-type"]];
    // express.raw only parses whitelisted types; anything else arrives unparsed.
    if (!ext || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(415).json({ error: "unsupported image type" });
      return;
    }
    const key = `${crypto.randomUUID()}.${ext}`;
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: ASSET_PREFIX + key,
          Body: req.body,
          ContentType: req.headers["content-type"],
        }),
      );
      res.json({ url: `/api/img/${key}` });
    } catch (err) {
      console.error("upload failed:", err?.message ?? err);
      res.status(502).json({ error: "storage unavailable" });
    }
  },
);

const KEY_RE = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;

app.get("/api/img/:key", async (req, res) => {
  const { key } = req.params;
  if (!KEY_RE.test(key)) {
    res.status(404).end();
    return;
  }
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: ASSET_PREFIX + key }),
    );
    res.setHeader("Content-Type", obj.ContentType ?? "application/octet-stream");
    if (obj.ContentLength != null) {
      res.setHeader("Content-Length", String(obj.ContentLength));
    }
    // Keys are content-addressed-ish (random UUID, write-once): cache hard.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    obj.Body.pipe(res);
  } catch (err) {
    if (err?.name === "NoSuchKey") res.status(404).end();
    else {
      console.error("image fetch failed:", err?.message ?? err);
      res.status(502).end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`mathsboard api ${VERSION} listening on :${PORT}`);
});
