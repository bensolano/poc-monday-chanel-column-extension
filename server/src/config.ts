import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || "../.env" });

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4000),
  mondayApiKey: env.MONDAY_API_KEY ?? "",
  targetUploadUrl: env.TARGET_UPLOAD_URL ?? "",
  maxFileSizeMb: Number(env.MAX_FILE_SIZE_MB ?? 4096),
  chunkSizeMb: Number(env.CHUNK_SIZE_MB ?? 8),
  uploadDir: path.resolve(process.cwd(), env.UPLOAD_DIR ?? "./uploads"),
};
