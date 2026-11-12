export interface MediaCommandIdentity {
  operation:
    | "replace_company_logo"
    | "replace_profile_photo"
    | "remove_profile_photo"
    | "create_employee_document";
  parentId: string;
  expectedVersion: number | null;
  expectedPointerDocumentId: string | null;
  file?: Blob;
  fileName?: string;
  mimeType?: string;
}

/**
 * A lost HTTP response must be retried with the same server idempotency key.
 * Replacement commands already carry an optimistic parent version, so a
 * confirmed command changes the fingerprint while an identical retry does not.
 */
export async function createMediaIdempotencyKey(identity: MediaCommandIdentity): Promise<string> {
  const fileDigest = identity.file ? await sha256(await identity.file.arrayBuffer()) : null;
  const command = new TextEncoder().encode(
    JSON.stringify({
      operation: identity.operation,
      parent_id: identity.parentId,
      expected_version: identity.expectedVersion,
      expected_pointer_document_id: identity.expectedPointerDocumentId,
      file_digest: fileDigest,
      file_name: identity.fileName ?? null,
      mime_type: identity.mimeType?.trim().toLowerCase() ?? null,
    }),
  );
  return `media-${await sha256(command.buffer)}`;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
