import fs from "node:fs";
import axios from "axios";
import FormData from "form-data";
import { config } from "../config.js";
import type { UploadSession } from "../types.js";

export async function forwardFileAndMetadata(session: UploadSession): Promise<boolean> {
  if (!config.targetUploadUrl) {
    console.info("[upload][forward] Skipped: TARGET_UPLOAD_URL is empty");
    return false;
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(session.assembledFilePath), {
    filename: session.fileName,
    contentType: session.mimeType || "application/octet-stream",
  });

  form.append(
    "metadata",
    JSON.stringify({
      boardId: session.boardId,
      boardName: session.boardName,
      columnId: session.columnId,
      itemId: session.itemId,
      itemName: session.itemName,
      fileName: session.fileName,
      mimeType: session.mimeType,
      fileSize: session.fileSize,
    }),
  );

  await axios.post(config.targetUploadUrl, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 0,
  });

  console.info("[upload][forward] Done", { uploadId: session.uploadId, target: config.targetUploadUrl });
  return true;
}
