export type UploadSession = {
  uploadId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  boardId: number;
  boardName: string;
  columnId: string;
  itemId: number;
  itemName: string;
  chunkSize: number;
  totalChunks: number;
  uploadPath: string;
  chunksPath: string;
  assembledFilePath: string;
};

export type MondayColumnMetadata = {
  id: string;
  title: string;
  type: string;
  settings_str?: string | null;
};
