import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { forwardFileAndMetadata } from "../services/forwarder.js";
import type { UploadSession } from "../types.js";

const sessions = new Map<string, UploadSession>();

const tempChunkDir = path.join(config.uploadDir, "_tmp_chunks");
void fsp.mkdir(tempChunkDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempChunkDir),
    filename: (_req, _file, cb) => cb(null, `${uuidv4()}.part`),
  }),
  limits: {
    fileSize: config.chunkSizeMb * 1024 * 1024 + 1024,
  },
});

async function appendChunk(targetFilePath: string, chunkPath: string): Promise<void> {
  await pipeline(fs.createReadStream(chunkPath), fs.createWriteStream(targetFilePath, { flags: "a" }));
}

export const uploadRouter = Router();

uploadRouter.post("/init", async (req, res) => {
  const { fileName, fileSize, mimeType, boardId, boardName, columnId, itemId, itemName } = req.body as {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    boardId?: number;
    boardName?: string;
    columnId?: string;
    itemId?: number;
    itemName?: string;
  };

  if (!fileName || !fileSize || !boardId || !boardName || !columnId || !itemId || !itemName) {
    res.status(400).json({ error: "Missing required init payload fields" });
    return;
  }

  console.info("[upload][init]", { fileName, fileSize, boardId, boardName, columnId, itemId, itemName });

  const maxBytes = config.maxFileSizeMb * 1024 * 1024;
  if (fileSize > maxBytes) {
    res.status(413).json({ error: `File exceeds MAX_FILE_SIZE_MB=${config.maxFileSizeMb}` });
    return;
  }

  const uploadId = uuidv4();
  const uploadPath = path.join(config.uploadDir, uploadId);
  const chunksPath = path.join(uploadPath, "chunks");
  const assembledFilePath = path.join(uploadPath, fileName);
  const chunkSize = config.chunkSizeMb * 1024 * 1024;

  await fsp.mkdir(chunksPath, { recursive: true });

  sessions.set(uploadId, {
    uploadId,
    fileName,
    mimeType: mimeType || "application/octet-stream",
    fileSize,
    boardId,
    boardName,
    columnId,
    itemId,
    itemName,
    chunkSize,
    totalChunks: Math.ceil(fileSize / chunkSize),
    uploadPath,
    chunksPath,
    assembledFilePath,
  });

  res.json({ uploadId, chunkSize });
});

uploadRouter.post("/chunk", upload.single("chunk"), async (req, res) => {
  const { uploadId, chunkIndex } = req.body as {
    uploadId?: string;
    chunkIndex?: string;
  };

  if (!uploadId || chunkIndex === undefined || !req.file) {
    res.status(400).json({ error: "Missing uploadId, chunkIndex, or chunk file" });
    return;
  }

  const session = sessions.get(uploadId);
  if (!session) {
    res.status(404).json({ error: "Upload session not found" });
    return;
  }

  const chunkIndexNum = Number(chunkIndex);
  const chunkTargetPath = path.join(session.chunksPath, `chunk-${chunkIndexNum}.part`);

  await fsp.rename(req.file.path, chunkTargetPath);
  if (chunkIndexNum === 0 || chunkIndexNum === session.totalChunks - 1) {
    console.info("[upload][chunk]", {
      uploadId,
      chunkIndex: chunkIndexNum,
      totalChunks: session.totalChunks,
    });
  }
  res.json({ ok: true });
});

uploadRouter.post("/complete", async (req, res) => {
  const { uploadId } = req.body as {
    uploadId?: string;
  };

  if (!uploadId) {
    res.status(400).json({ error: "Missing uploadId" });
    return;
  }

  const session = sessions.get(uploadId);
  if (!session) {
    res.status(404).json({ error: "Upload session not found" });
    return;
  }

  let shouldDeleteSession = false;

  try {
    console.info("[upload][complete] Started", { uploadId, fileName: session.fileName });
    await fsp.rm(session.assembledFilePath, { force: true });

    for (let index = 0; index < session.totalChunks; index += 1) {
      const chunkPath = path.join(session.chunksPath, `chunk-${index}.part`);
      await appendChunk(session.assembledFilePath, chunkPath);
    }

    const metadataPayload = {
      metadata: {
        boardId: session.boardId,
        boardName: session.boardName,
        itemId: session.itemId,
        itemName: session.itemName,
        fileName: session.fileName,
      },
    };

    await fsp.writeFile(
      path.join(session.uploadPath, "metadata.json"),
      `${JSON.stringify(metadataPayload, null, 2)}\n`,
      "utf8",
    );

    const forwarded = await forwardFileAndMetadata(session);

    shouldDeleteSession = true;

    console.info("[upload][complete] Done", {
      uploadId,
      uploadPath: session.uploadPath,
      assembledFilePath: session.assembledFilePath,
      metadataPath: path.join(session.uploadPath, "metadata.json"),
      forwarded,
    });

    res.json({ ok: true, forwarded, uploadPath: session.uploadPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload completion failed";
    console.error("[upload][complete] Error", { uploadId, message });

    res.status(500).json({ error: message });
  } finally {
    await fsp.rm(session.chunksPath, { recursive: true, force: true });
    if (shouldDeleteSession) {
      sessions.delete(uploadId);
    }
  }
});
