# Monday File Column Extension — Client Repro Guide (Clic up)

## Goal
Build and run a monday.com **Board Column Extension** (Files column) that uploads large files from the extension UI and sends them to your **Clic up** backend.

## Architecture (concise)
- **Frontend (Vite + React + Vibe)** runs inside monday iframe.
- Frontend gets monday context + board items via SDK and uploads file in chunks.
- **Backend (Express)** assembles chunks, writes file + `metadata.json`, and optionally forwards to Clic up.
- Metadata written/sent includes `boardId`, `boardName`, `itemId`, `itemName`, `fileName`.

## Required docs
### monday
- Board Column Extension: <https://developer.monday.com/apps/docs/board-column-extension>
- Vibe Design System: <https://developer.monday.com/apps/docs/vibe-design-system>
- SDK `monday.get`: <https://developer.monday.com/apps/docs/mondayget>
- SDK `monday.api`: <https://developer.monday.com/apps/docs/mondayapi>
- Apps CLI (`mapps`): <https://developer.monday.com/apps/docs/command-line-interface-cli>
- Deploy your app: <https://developer.monday.com/apps/docs/deploy-your-app>

### Vite
- Dev server options (`server.allowedHosts`): <https://vite.dev/config/server-options>
- Dev proxy (`server.proxy`): <https://vite.dev/config/server-options#server-proxy>

## Production setup (primary)

### 1) Deployment options (what to choose)
- **Client-side app code** (the UI in iframe):
   - Deploy via monday CLI to monday infra (**recommended**), or
   - Host externally and provide render URL.
- **Server-side code** (upload API):
   - Deploy to monday code via CLI, or
   - Keep external (recommended here if Clic up backend already exists).

### 2) Why deploy UI “server-side” at all?
- You do **not** deploy UI as backend runtime.
- UI still runs in the browser iframe.
- “Deploy UI via monday CLI” means uploading static client assets to monday-hosted CDN/infra.

### 3) Recommended production path for this use case
- Deploy **UI** with monday CLI (stable hosting/versioning).
- Keep **upload backend** external (your current server or Clic up service boundary).
- Set app feature render URL / deployment target in Developer Center accordingly.

### 4) Required backend env vars
- `TARGET_UPLOAD_URL`: Clic up upload endpoint (optional if only local validation).

### 5) Required frontend env var
- `VITE_STATUS_MESSAGE_COLUMN_ID`: text/long-text column ID on the same board where success/error message is written after upload.

## Clic up integration contract
Backend sends multipart form-data:
- `file`: assembled uploaded file
- `metadata` (JSON string) including:
   - `boardId`, `boardName`
   - selected item (`itemId`, `itemName`)
  - `fileName`, `mimeType`, `fileSize`

## Local dev (bonus)
1. `npm install`
2. `npm run dev`
3. Use `mapps` tunnel URL in feature config during development.

## Expected output
For each upload in `server/uploads/<uploadId>/`:
- final assembled file
- `metadata.json`
- `chunks/` is temporary and removed on completion
