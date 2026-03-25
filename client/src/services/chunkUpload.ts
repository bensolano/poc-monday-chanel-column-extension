import type { UploadInitResponse } from "../types";

type ChunkUploadPayload = {
  file: File;
  boardId: number;
  columnId: string;
  itemId: number;
  itemName: string;
  boardName: string;
  serverBaseUrl: string;
};

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `${response.status} ${response.statusText}`;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const waitMs = 500 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

export async function uploadFileInChunks({
  file,
  boardId,
  columnId,
  itemId,
  itemName,
  boardName,
  serverBaseUrl,
}: ChunkUploadPayload): Promise<void> {
  console.info("[upload] init", {
    serverBaseUrl,
    fileName: file.name,
    fileSize: file.size,
    boardId,
    columnId,
    itemId,
  });

  const initResponse = await fetch(`${serverBaseUrl}/upload/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      boardId,
      columnId,
      itemId,
      itemName,
      boardName,
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`Failed to initialize upload session: ${await readErrorMessage(initResponse)}`);
  }

  const { uploadId, chunkSize } = (await initResponse.json()) as UploadInitResponse;
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    await withRetry(async () => {
      const formData = new FormData();
      formData.append("chunk", chunk, `${file.name}.part.${index}`);
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(index));
      formData.append("totalChunks", String(totalChunks));

      const response = await fetch(`${serverBaseUrl}/upload/chunk`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Chunk ${index + 1}/${totalChunks} failed: ${await readErrorMessage(response)}`);
      }
    });

    if (index % 10 === 0 || index === totalChunks - 1) {
      console.info("[upload] chunk progress", { done: index + 1, totalChunks });
    }
  }

  const completeResponse = await fetch(`${serverBaseUrl}/upload/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uploadId, boardId, columnId }),
  });

  if (!completeResponse.ok) {
    throw new Error(`Failed to complete upload: ${await readErrorMessage(completeResponse)}`);
  }

  console.info("[upload] complete", { uploadId });
}
