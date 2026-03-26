# monday.com large file column extension (POC)

POC for a **Board Column Extension** on monday.com (Files column) with a minimal Vibe UI:

- file picker
- item selector (board items)
- `Send` button
- loader
- upload confirmation

The frontend uploads in chunks to a local backend. On completion, the backend:

1. writes `metadata.json` in the upload directory with selected item + file metadata
2. optionally forwards metadata + file to `TARGET_UPLOAD_URL` when it is configured

All monday GraphQL calls are executed from the client (inside the monday iframe) through `monday.api`.

## Official docs used

- <https://developer.monday.com/apps/docs/board-column-extension>
- <https://developer.monday.com/apps/docs/vibe-design-system>
- <https://developer.monday.com/apps/docs/mondayget>
- <https://developer.monday.com/apps/docs/mondayapi>

## Project structure

```text
.
├── client/                      # monday extension UI (React + Vibe)
│   └── src/
│       ├── App.tsx              # minimal upload UI
│       └── services/
│           ├── monday.ts        # monday context retrieval
│           └── chunkUpload.ts   # chunk upload orchestrator
├── server/                      # local upload backend (Node/Express)
│   └── src/
│       ├── routes/upload.ts     # /upload/init, /upload/chunk, /upload/complete
│       └── services/
│           └── forwarder.ts     # forwards file + metadata to target endpoint
└── .env.example
```

## Why this works for files > 500MB

- Upload is **chunked** (default 8MB chunks) instead of a single giant request.
- Chunks are written to disk, then assembled via stream append.
- Final forwarding (optional) uses streaming multipart form-data (no full in-memory file buffer).
- Basic per-chunk retry is enabled client-side.

## Prerequisites

- Node.js 20+
- monday.com developer account
- App created in monday Developer Center

## 1) Configure monday app feature

In monday Developer Center:

1. Create app.
2. Add **Board column extension** feature.
3. In feature config, enable **Files** column type.
4. Use your `mapps` tunnel URL (for example `https://<id>.apps-tunnel.monday.app`) as the extension URL while developing.
5. Ensure app scopes allow reading board/column data.

Notes from official docs:

- Board column extension supports Files column type.
- Context is read in the iframe via `monday.get("context")`.

## 2) Configure environment

Copy env file:

```bash
cp .env.example .env
```

Set values in `.env`:

- `TARGET_UPLOAD_URL` = optional external API endpoint that receives file + metadata
- `VITE_STATUS_COLUMN_ID` = monday status column id used for lifecycle updates (`En cours`, `Reçu Clic`, `Erreur`)
- `VITE_ADBOX_TEXT_COLUMN_ID` = monday text column id whose value is sent as `adboxId` in metadata
- `VITE_UPLOAD_DETAILS_COLUMN_ID` = monday text/long-text column id used for human-readable upload details messages
- optional tuning:
  - `MAX_FILE_SIZE_MB` (default `4096`)
  - `CHUNK_SIZE_MB` (default `8`)

## 3) Install and run locally

```bash
npm install
npm run dev
```

Services:

- frontend: `http://localhost:3000`
- backend: `http://localhost:4000`

If you use `mapps` tunnel and see `host is not allowed` from Vite, ensure `server.allowedHosts` is configured in `client/vite.config.ts`.

By default, the client calls `/api` and Vite proxies it to `http://localhost:4000`, so uploads work from the HTTPS tunnel without mixed-content issues.

## 4) Upload flow

- UI loads monday context using `monday.get("context")` and extracts `boardId`/`columnId`.
- User selects file and clicks `Send`.
- Client sets status column to `En cours`.
- Client writes a details message (`Upload started for ...`).
- Client reads adbox id from `VITE_ADBOX_TEXT_COLUMN_ID` on selected item.
- Client calls `POST /upload/init`, then `POST /upload/chunk` for each chunk, then `POST /upload/complete`.
- Client sets status column to `Reçu Clic` on success, or `Erreur` on failure.
- Client writes success/failure details messages in the details text column.
- Backend on `/complete` also writes `metadata.json` next to the uploaded file.

## Payload sent to target endpoint

This section applies only when `TARGET_UPLOAD_URL` is configured.

The backend sends multipart/form-data with:

- `file`: assembled file stream
- `metadata` (JSON string):
  - `boardId`
  - `boardName`
  - `columnId`
  - `itemId`
  - `itemName`
  - `adboxId`
  - `fileName`, `mimeType`, `fileSize`

## UI scope (intentionally minimal)

Implemented exactly as requested:

- single file input
- one `Send` button
- loader while uploading
- confirmation after upload

## Troubleshooting

- If UI shows missing board/column context, confirm app is opened as Board column extension in a board column (not standalone browser tab).
- If status/adbox/details updates fail, verify `VITE_STATUS_COLUMN_ID`, `VITE_ADBOX_TEXT_COLUMN_ID`, `VITE_UPLOAD_DETAILS_COLUMN_ID`, and app/user permissions.
- If forwarding fails, verify `TARGET_UPLOAD_URL` accepts multipart form-data.
- For very large files on weak networks, reduce `CHUNK_SIZE_MB` (e.g. `4`) to improve reliability.
- If you see `Failed to fetch` on `Send`, make sure backend is running and calls are going through `/api` proxy (or set `VITE_SERVER_BASE_URL` to an HTTPS backend URL for external hosting).

### Why you might see `chunk-0.part`

- During upload, the backend stores temporary chunk files (`chunk-<n>.part`) before assembly.
- On successful `/complete`, the `chunks/` folder is removed and only the final file + `metadata.json` remain.
- If `/complete` fails, chunk files may remain for debugging.
