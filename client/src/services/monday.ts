import mondaySdk from "monday-sdk-js";
import type { BoardItem, MondayContext } from "../types";

const monday = mondaySdk();

type MondayApiResponse = {
  errors?: Array<{ message?: string }>;
  data?: {
    boards?: Array<{
      name?: string;
      items_page?: {
        items?: Array<{ id: string; name: string }>;
      };
    }>;
  };
};

export async function getMondayContext(): Promise<MondayContext> {
  const result = await monday.get("context");
  return (result?.data ?? {}) as MondayContext;
}

export function extractBoardId(context: MondayContext): number | undefined {
  return (
    context.boardId ??
    context.locationContext?.boardId ??
    (typeof context["board_id"] === "number" ? (context["board_id"] as number) : undefined)
  );
}

export function extractColumnId(context: MondayContext): string | undefined {
  const directColumnId =
    (typeof context.columnId === "string" && context.columnId) ||
    (typeof context.locationContext?.columnId === "string" && context.locationContext.columnId) ||
    (typeof context["column_id"] === "string" ? (context["column_id"] as string) : undefined);

  if (directColumnId) {
    return directColumnId;
  }

  const maybeColumn = context["column"];
  if (maybeColumn && typeof maybeColumn === "object" && "id" in maybeColumn) {
    const id = (maybeColumn as { id?: unknown }).id;
    if (typeof id === "string") {
      return id;
    }
  }

  return undefined;
}

export async function getBoardItems(boardId: number): Promise<BoardItem[]> {
  const query = `
    query GetBoardItems($boardId: [ID!]) {
      boards(ids: $boardId) {
        items_page(limit: 100) {
          items {
            id
            name
          }
        }
      }
    }
  `;

  const result = (await monday.api(query, {
    variables: { boardId },
  })) as MondayApiResponse;

  const rawItems = result.data?.boards?.[0]?.items_page?.items ?? [];

  return rawItems.map((item) => ({ id: Number(item.id), name: item.name })).filter((item) => Number.isFinite(item.id));
}

export async function getBoardName(boardId: number): Promise<string | null> {
  const query = `
    query GetBoardName($boardId: [ID!]) {
      boards(ids: $boardId) {
        name
      }
    }
  `;

  const result = (await monday.api(query, {
    variables: { boardId },
  })) as MondayApiResponse;

  return result.data?.boards?.[0]?.name ?? null;
}

export async function updateItemUploadStatusMessage(
  boardId: number,
  itemId: number,
  statusMessageColumnId: string,
  message: string,
): Promise<void> {
  if (!statusMessageColumnId) {
    throw new Error("Missing VITE_STATUS_MESSAGE_COLUMN_ID");
  }

  const mutation = `
    mutation SetUploadStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
      change_simple_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) {
        id
      }
    }
  `;

  const result = (await monday.api(mutation, {
    variables: {
      boardId,
      itemId,
      columnId: statusMessageColumnId,
      value: message,
    },
  })) as MondayApiResponse;

  if (result.errors?.length) {
    const messageText = result.errors[0]?.message ?? "Unknown monday GraphQL error";
    throw new Error(`Status update failed: ${messageText}`);
  }

  console.info("[upload][monday] Status message updated", {
    boardId,
    itemId,
    statusMessageColumnId,
  });
}
