"use client";

import { createContext, useContext } from "react";

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  speed: number | null; // bytes/sec
  etaSec: number | null;
};

export type UploadCtxValue = {
  items: UploadItem[];
  addFiles: (files: File[] | FileList, folderId?: string) => void;
  addFilesWithFolders: (items: { file: File; folderId: string; name?: string }[]) => void;
  removeItem: (id: string) => void;
  retryItem: (id: string) => void;
  clearFinished: () => void;
  activeCount: number;
};

export const UploadCtx = createContext<UploadCtxValue | null>(null);

// The provider is lazy-loaded (heavy Uppy bundle), so it may not be mounted yet
// on first paint — hand out a no-op value instead of throwing.
const STUB: UploadCtxValue = {
  items: [],
  addFiles: () => {},
  addFilesWithFolders: () => {},
  removeItem: () => {},
  retryItem: () => {},
  clearFinished: () => {},
  activeCount: 0,
};

export function useUpload(): UploadCtxValue {
  return useContext(UploadCtx) ?? STUB;
}
