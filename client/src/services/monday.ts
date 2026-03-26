import mondaySdk from "monday-sdk-js";
import type { BoardItem, MondayContext } from "../types";

const monday = mondaySdk();

export type UploadLifecycleStatus = "En cours" | "Reçu Clic" | "Erreur";

type MondayApiResponse = {
  errors?: Array<{ message?: string }>;
  data?: {
    items?: Array<{
      column_values?: Array<{
        id?: string;
        text?: string;
      }>;
    }>;
    boards?: Array<{
      name?: string;
      items?: Array<{
        column_values?: Array<{
          id?: string;
          text?: string;
        }>;
      }>;
      items_page?: {
        items?: Array<{ id: string; name: string }>;
      };
    }>;
  };
};

function throwGraphQLError(prefix: string, result: MondayApiResponse, context: Record<string, unknown>): never {
  const messageText = result.errors?.[0]?.message ?? "Unknown monday GraphQL error";
  console.error("[upload][monday] GraphQL error", {
    prefix,
    message: messageText,
    errors: result.errors,
    ...context,
  });
  throw new Error(`${prefix}: ${messageText}`);
}

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

export async function getItemTextColumnValue(boardId: number, itemId: number, textColumnId: string): Promise<string> {
  if (!textColumnId) {
    throw new Error("Missing VITE_ADBOX_TEXT_COLUMN_ID");
  }

  const query = `
    query GetItemTextColumnValue($itemIds: [ID!], $columnIds: [String!]) {
      items(ids: $itemIds) {
        column_values(ids: $columnIds) {
          id
          text
        }
      }
    }
  `;

  const result = (await monday.api(query, {
    variables: {
      itemIds: [itemId],
      columnIds: [textColumnId],
    },
  })) as MondayApiResponse;

  if (result.errors?.length) {
    throwGraphQLError("Failed to load adboxId from text column", result, {
      boardId,
      itemId,
      textColumnId,
    });
  }

  return result.data?.items?.[0]?.column_values?.[0]?.text ?? "";
}

export async function updateItemUploadLifecycleStatus(
  boardId: number,
  itemId: number,
  statusColumnId: string,
  status: UploadLifecycleStatus,
): Promise<void> {
  if (!statusColumnId) {
    throw new Error("Missing VITE_STATUS_COLUMN_ID");
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
      columnId: statusColumnId,
      value: status,
    },
  })) as MondayApiResponse;

  if (result.errors?.length) {
    throwGraphQLError("Status update failed", result, {
      boardId,
      itemId,
      statusColumnId,
      status,
    });
  }

  console.info("[upload][monday] Status message updated", {
    boardId,
    itemId,
    statusColumnId,
    status,
  });
}

export async function updateItemUploadDetailsMessage(
  boardId: number,
  itemId: number,
  detailsColumnId: string,
  message: string,
): Promise<void> {
  if (!detailsColumnId) {
    throw new Error("Missing VITE_UPLOAD_DETAILS_COLUMN_ID");
  }

  const mutation = `
    mutation SetUploadDetails($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
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
      columnId: detailsColumnId,
      value: message,
    },
  })) as MondayApiResponse;

  if (result.errors?.length) {
    throwGraphQLError("Details update failed", result, {
      boardId,
      itemId,
      detailsColumnId,
      message,
    });
  }

  console.info("[upload][monday] Details message updated", {
    boardId,
    itemId,
    detailsColumnId,
  });
}
