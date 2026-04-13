export interface PageSize {
  width_pts: number;
  height_pts: number;
}

export interface DocumentManifest {
  doc_id: number;
  page_count: number;
  filename: string;
  path: string;
  page_sizes: PageSize[];
  can_undo: boolean;
  can_redo: boolean;
}
