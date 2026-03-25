import fs from "node:fs/promises";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { uploadRouter } from "./routes/upload.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
  console.info("[server] request", {
    method: req.method,
    path: req.path,
    host: req.headers.host,
    origin: req.headers.origin,
    forwardedProto: req.headers["x-forwarded-proto"],
  });
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/upload", uploadRouter);

async function start() {
  await fs.mkdir(config.uploadDir, { recursive: true });

  app.listen(config.port, () => {
    console.log(`Upload backend listening on http://localhost:${config.port}`);
  });
}

void start();
