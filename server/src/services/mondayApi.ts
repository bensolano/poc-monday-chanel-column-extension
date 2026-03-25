import axios from "axios";
import { config } from "../config.js";
import type { MondayColumnMetadata } from "../types.js";

const API_URL = "https://api.monday.com/v2";

export async function getColumnMetadata(boardId: number, columnId: string): Promise<MondayColumnMetadata> {
  if (!config.mondayApiKey) {
    throw new Error("Missing MONDAY_API_KEY on backend");
  }

  console.info("[upload][monday] Fetching column metadata", { boardId, columnId });

  const query = `
    query GetColumnMetadata($boardId: [ID!], $columnIds: [String!]) {
      boards(ids: $boardId) {
        id
        columns(ids: $columnIds) {
          id
          title
          type
          settings_str
        }
      }
    }
  `;

  const response = await axios.post(
    API_URL,
    {
      query,
      variables: {
        boardId,
        columnIds: [columnId],
      },
    },
    {
      headers: {
        Authorization: config.mondayApiKey,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    },
  );

  if (response.data.errors?.length) {
    throw new Error(response.data.errors[0]?.message ?? "monday API error");
  }

  const column = response.data?.data?.boards?.[0]?.columns?.[0] as MondayColumnMetadata | undefined;

  if (!column) {
    throw new Error("Column metadata not found");
  }

  console.info("[upload][monday] Column metadata fetched", { id: column.id, title: column.title });

  return column;
}
