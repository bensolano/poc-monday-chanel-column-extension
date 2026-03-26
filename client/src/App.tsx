import { useEffect, useMemo, useState } from "react";
import { AlertBanner, AlertBannerText, AttentionBox, Button, Loader, Text } from "@vibe/core";
import type { BoardItem } from "./types";
import {
  extractBoardId,
  extractColumnId,
  getBoardName,
  getBoardItems,
  getItemTextColumnValue,
  getMondayContext,
  updateItemUploadDetailsMessage,
  updateItemUploadLifecycleStatus,
} from "./services/monday";
import { uploadFileInChunks } from "./services/chunkUpload";

const SERVER_BASE_URL =
  (import.meta.env.VITE_SERVER_BASE_URL as string | undefined) ?? "/api";
const STATUS_COLUMN_ID =
  (import.meta.env.VITE_STATUS_COLUMN_ID as string | undefined) ??
  (import.meta.env.VITE_STATUS_MESSAGE_COLUMN_ID as string | undefined) ??
  "";
const ADBOX_TEXT_COLUMN_ID =
  (import.meta.env.VITE_ADBOX_TEXT_COLUMN_ID as string | undefined) ?? "";
const UPLOAD_DETAILS_COLUMN_ID =
  (import.meta.env.VITE_UPLOAD_DETAILS_COLUMN_ID as string | undefined) ?? "";

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<number | undefined>();
  const [columnId, setColumnId] = useState<string | undefined>();
  const [items, setItems] = useState<BoardItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isItemsLoading, setIsItemsLoading] = useState(false);
  const [boardName, setBoardName] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const context = await getMondayContext();
        const nextBoardId = extractBoardId(context);
        setBoardId(nextBoardId);
        const nextColumnId = extractColumnId(context);
        setColumnId(nextColumnId);

        if (nextBoardId) {
          setIsItemsLoading(true);
          const boardItems = await getBoardItems(nextBoardId);
          setItems(boardItems);
          if (boardItems.length > 0) {
            setSelectedItemId(boardItems[0].id);
          }

          const nextBoardName = await getBoardName(nextBoardId);
          setBoardName(nextBoardName);
        }
      } catch (contextError) {
        console.error("[upload][monday] Failed to load context", {
          contextError,
        });
        setError("Failed to load monday context.");
      } finally {
        setIsItemsLoading(false);
      }
    };

    void loadContext();
  }, []);

  const isSendDisabled = useMemo(
    () =>
      !file ||
      isUploading ||
      !boardId ||
      !columnId ||
      !selectedItemId ||
      !STATUS_COLUMN_ID ||
      !ADBOX_TEXT_COLUMN_ID ||
      !UPLOAD_DETAILS_COLUMN_ID,
    [file, isUploading, boardId, columnId, selectedItemId]
  );

  const onSend = async () => {
    if (!file || !boardId || !columnId || !selectedItemId) {
      setError("Missing file, item selection, or monday board/column context.");
      return;
    }

    if (!boardName) {
      setError("Missing board name.");
      return;
    }

    if (!STATUS_COLUMN_ID) {
      setError("Missing status column config: set VITE_STATUS_COLUMN_ID.");
      return;
    }

    if (!ADBOX_TEXT_COLUMN_ID) {
      setError("Missing adbox text column config: set VITE_ADBOX_TEXT_COLUMN_ID.");
      return;
    }

    if (!UPLOAD_DETAILS_COLUMN_ID) {
      setError("Missing upload details column config: set VITE_UPLOAD_DETAILS_COLUMN_ID.");
      return;
    }

    const selectedItem = items.find((item) => item.id === selectedItemId);
    if (!selectedItem) {
      setError("Selected item not found.");
      return;
    }

    setError(null);
    setStatusNotice(null);
    setUploadDone(false);
    setIsUploading(true);

    try {
      await updateItemUploadDetailsMessage(
        boardId,
        selectedItem.id,
        UPLOAD_DETAILS_COLUMN_ID,
        `Upload started for ${file.name}`,
      );

      await updateItemUploadLifecycleStatus(
        boardId,
        selectedItem.id,
        STATUS_COLUMN_ID,
        "En cours",
      );

      const adboxId = await getItemTextColumnValue(
        boardId,
        selectedItem.id,
        ADBOX_TEXT_COLUMN_ID,
      );

      await uploadFileInChunks({
        file,
        boardId,
        columnId,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        boardName,
        adboxId,
        serverBaseUrl: SERVER_BASE_URL
      });

      try {
        await updateItemUploadDetailsMessage(
          boardId,
          selectedItem.id,
          UPLOAD_DETAILS_COLUMN_ID,
          `File ${file.name} uploaded successfully`,
        );

        await updateItemUploadLifecycleStatus(
          boardId,
          selectedItem.id,
          STATUS_COLUMN_ID,
          "Reçu Clic",
        );
      } catch (statusError) {
        const statusMessage = statusError instanceof Error ? statusError.message : "Unknown status update error";
        console.error("[upload][monday] success status update failed", {
          boardId,
          itemId: selectedItem.id,
          statusColumnId: STATUS_COLUMN_ID,
          statusMessage,
        });
        setStatusNotice(`Upload succeeded, but status column was not updated: ${statusMessage}`);
      }

      setUploadDone(true);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
      console.error("[upload] Upload flow failed", {
        boardId,
        itemId: selectedItem.id,
        fileName: file.name,
        statusColumnId: STATUS_COLUMN_ID,
        adboxTextColumnId: ADBOX_TEXT_COLUMN_ID,
        uploadDetailsColumnId: UPLOAD_DETAILS_COLUMN_ID,
        message,
        uploadError,
      });

      try {
        await updateItemUploadDetailsMessage(
          boardId,
          selectedItem.id,
          UPLOAD_DETAILS_COLUMN_ID,
          `Upload failed for ${file.name}: ${String(message).slice(0, 220)}`,
        );

        await updateItemUploadLifecycleStatus(
          boardId,
          selectedItem.id,
          STATUS_COLUMN_ID,
          "Erreur",
        );
      } catch (statusError) {
        const statusMessage = statusError instanceof Error ? statusError.message : "Unknown status update error";
        console.error("[upload][monday] failure status update failed", {
          boardId,
          itemId: selectedItem.id,
          statusColumnId: STATUS_COLUMN_ID,
          statusMessage,
        });
        setStatusNotice(`Upload failed and status column was not updated: ${statusMessage}`);
      }

      setError(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 560 }}>
      <AttentionBox
        type="primary"
        title="Large file uploader"
        text="Select one board item, attach one file, then click Send."
      />

      <div style={{ display: "grid", gap: 8 }}>
        <Text type="text1" weight="medium">
          Upload file
        </Text>

        <input
          type="file"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setUploadDone(false);
            setError(null);
          }}
        />
        {file ? (
          <Text type="text2" color="secondary">
            Selected: {file.name}
          </Text>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor="item-select">
          <Text type="text2" weight="medium">
            Item
          </Text>
        </label>
        <select
          id="item-select"
          disabled={isItemsLoading || items.length === 0}
          value={selectedItemId ?? ""}
          onChange={(event) => {
            const value = Number(event.target.value);
            setSelectedItemId(Number.isFinite(value) ? value : null);
          }}
          style={{ padding: 8, borderRadius: 8 }}
        >
          {items.length === 0 ? <option value="">No items found</option> : null}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <Button onClick={onSend} disabled={isSendDisabled}>
        Send
      </Button>

      {isUploading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader size={24} />
          <Text type="text2" color="secondary">
            Uploading...
          </Text>
        </div>
      ) : null}

      {uploadDone ? (
        <AlertBanner onClose={() => setUploadDone(false)}>
          <AlertBannerText text="File uploaded successfully" />
        </AlertBanner>
      ) : null}

      {error ? (
        <AlertBanner backgroundColor="negative" onClose={() => setError(null)}>
          <AlertBannerText text={error} />
        </AlertBanner>
      ) : null}

      {statusNotice ? (
        <AlertBanner backgroundColor="warning" onClose={() => setStatusNotice(null)}>
          <AlertBannerText text={statusNotice} />
        </AlertBanner>
      ) : null}

      {!boardId || !columnId ? (
        <Text type="text2" color="secondary">
          Waiting for board/column context...
        </Text>
      ) : null}

      {boardName ? (
        <Text type="text2" color="secondary">
          Board: {boardName}
        </Text>
      ) : null}

      {isItemsLoading ? (
        <Text type="text2" color="secondary">
          Loading board items...
        </Text>
      ) : null}

      {!STATUS_COLUMN_ID ? (
        <Text type="text2" color="secondary">
          Status column updates are disabled: set VITE_STATUS_COLUMN_ID.
        </Text>
      ) : null}

      {!ADBOX_TEXT_COLUMN_ID ? (
        <Text type="text2" color="secondary">
          adboxId metadata is disabled: set VITE_ADBOX_TEXT_COLUMN_ID.
        </Text>
      ) : null}

      {!UPLOAD_DETAILS_COLUMN_ID ? (
        <Text type="text2" color="secondary">
          Upload details messages are disabled: set VITE_UPLOAD_DETAILS_COLUMN_ID.
        </Text>
      ) : null}
    </div>
  );
}

export default App;
