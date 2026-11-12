import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const employeeId = "11111111-1111-4111-8111-111111111111";
const existingDocumentId = "22222222-2222-4222-8222-222222222222";

const mock = vi.hoisted(() => ({
  documents: [] as Array<Record<string, unknown>>,
  upload: vi.fn(),
  deleteDocument: vi.fn(),
  createIdempotencyKey: vi.fn(async () => "media-idempotency-key"),
  invalidateQueries: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mock.invalidateQueries }),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: employeeId } }) }));

vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api")>()),
  useApiRouteEnabled: () => true,
}));

vi.mock("@/domains/documents", () => ({
  documentsApi: { createDownloadUrl: vi.fn() },
  mapApiDocuments: (rows: Array<Record<string, unknown>>) =>
    rows.map((row) => ({
      id: String(row.id),
      name: String(row.file_name),
      category: String(row.document_type),
      status: "pending",
      documentType: String(row.document_type),
    })),
  useDocumentDeleteMutation: () => ({ mutateAsync: mock.deleteDocument, isPending: false }),
  useDocumentUploadPolicy: () => ({
    data: {
      max_bytes: 1024,
      image_max_width: 1600,
      image_max_height: 1600,
      image_jpeg_quality: 0.82,
      allowed_mime_types: ["application/pdf"],
      image_output_mime_type: "image/jpeg",
    },
  }),
}));

vi.mock("@/domains/ems", () => ({
  useEmsDocumentMutation: () => ({ mutateAsync: mock.upload, isPending: false }),
  useEmsEmployeeDocuments: () => ({
    data: { items: mock.documents },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/shared/uploads/media-command", () => ({
  createMediaIdempotencyKey: mock.createIdempotencyKey,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mock.toastError,
    success: mock.toastSuccess,
    message: vi.fn(),
  },
}));

import { MyDocuments } from "@/routes/_app/ems.documents";

beforeEach(() => {
  mock.documents = [];
  mock.upload.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("employee proof upload journey", () => {
  it("creates a missing proof without claiming that it replaced a document", async () => {
    render(<MyDocuments />);

    fireEvent.click(screen.getAllByRole("button", { name: "Upload" })[0]!);
    selectFile(new File(["proof"], "identity.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    const [{ input, idempotencyKey }] = mock.upload.mock.calls[0]!;
    expect(idempotencyKey).toBe("media-idempotency-key");
    expect(input).toBeInstanceOf(FormData);
    expect(input.get("document_type")).toBe("identity_proof");
    expect(input.get("replace_document_id")).toBeNull();
    expect(mock.createIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "create_employee_document",
        parentId: employeeId,
        expectedPointerDocumentId: null,
        documentType: "identity_proof",
      }),
    );
    expect(mock.toastSuccess).toHaveBeenCalledWith("Document uploaded", {
      description: "identity.pdf is pending verification.",
    });
  });

  it("replaces a UUID-backed proof and binds the expected pointer", async () => {
    mock.documents = [
      {
        id: existingDocumentId,
        file_name: "Current identity proof",
        document_type: "identity_proof",
      },
    ];
    render(<MyDocuments />);

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    selectFile(new File(["replacement"], "replacement.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    const [{ input }] = mock.upload.mock.calls[0]!;
    expect(input.get("replace_document_id")).toBe(existingDocumentId);
    expect(mock.createIdempotencyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPointerDocumentId: existingDocumentId,
        documentType: "identity_proof",
      }),
    );
    expect(mock.toastSuccess).toHaveBeenCalledWith("Replacement uploaded", {
      description: "replacement.pdf is pending verification.",
    });
  });
});

function selectFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [file] } });
}
