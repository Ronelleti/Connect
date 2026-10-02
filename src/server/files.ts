import type { SharedFile } from "@/lib/types";
import { query } from "./db";

interface SharedFileRow {
  id: string;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

const META_COLUMNS = "id, uploaded_by_user_id, uploaded_by_name, filename, content_type, size_bytes, created_at";

function toSharedFile(row: SharedFileRow): SharedFile {
  return {
    id: row.id,
    uploadedByUserId: row.uploaded_by_user_id,
    uploadedByName: row.uploaded_by_name,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  };
}

export async function createSharedFile(input: {
  uploadedByUserId: string;
  uploadedByName: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  data: Buffer;
}) {
  const [row] = await query<SharedFileRow>(
    `INSERT INTO shared_files (uploaded_by_user_id, uploaded_by_name, filename, content_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${META_COLUMNS}`,
    [input.uploadedByUserId, input.uploadedByName, input.filename, input.contentType, input.sizeBytes, input.data]
  );
  return toSharedFile(row);
}

export async function listSharedFiles() {
  const rows = await query<SharedFileRow>(`SELECT ${META_COLUMNS} FROM shared_files ORDER BY created_at DESC`);
  return rows.map(toSharedFile);
}

export async function findSharedFileMeta(id: string) {
  const [row] = await query<SharedFileRow>(`SELECT ${META_COLUMNS} FROM shared_files WHERE id = $1`, [id]);
  return row ? toSharedFile(row) : null;
}

export async function findSharedFileWithData(id: string) {
  const [row] = await query<SharedFileRow & { data: Buffer }>("SELECT * FROM shared_files WHERE id = $1", [id]);
  return row ? { meta: toSharedFile(row), data: row.data } : null;
}

export async function deleteSharedFile(id: string) {
  await query("DELETE FROM shared_files WHERE id = $1", [id]);
}
