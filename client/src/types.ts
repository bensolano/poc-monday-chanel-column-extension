export type MondayContext = {
  boardId?: number;
  columnId?: string;
  locationContext?: {
    boardId?: number;
    columnId?: string;
  };
  [key: string]: unknown;
};

export type UploadInitResponse = {
  uploadId: string;
  chunkSize: number;
};

export type BoardItem = {
  id: number;
  name: string;
};
