import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ExpenseStatuses, Roles, type AuthUser, type DocumentMetadata, type ExpenseTicket } from "#shared";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import { MemoryObjectStorage } from "../../../platform/object-storage.js";
import { DocumentService } from "../service.js";

describe("expense receipt parent read policy in memory mode", () => {
  it("separates original-company detail from raw bytes by effective role and parent assignment", async () => {
    const store = createMemoryDataStore();
    const byCode = (code: string) => {
      const user = store.users.find((item) => item.employee_code === code);
      if (!user) throw new Error(`Missing fixture user ${code}`);
      return user;
    };
    const requester = byCode("E1");
    const unrelated = byCode("E2");
    const manager = byCode("D1");
    const finance = byCode("N1");
    const admin = byCode("ADM");
    const auditor = byCode("AUD");
    const companyA = store.companyProfiles[0]!;
    const companyB = { ...companyA, id: randomUUID(), company_slug: "receipt-company-b" };
    store.companyProfiles.push(companyB);
    const ticketId = randomUUID();
    const documentId = randomUUID();
    const storageKey = `receipt-test/${documentId}`;
    const ticket = {
      id: ticketId,
      requester_user_id: requester.id,
      manager_verifier_id: manager.id,
      finance_approver_id: finance.id,
      company_id: companyA.id,
      owner_resolution_status: "typed_creation",
      status: ExpenseStatuses.Draft,
      deleted_at: null,
    } as ExpenseTicket;
    store.tickets.push(ticket);
    const document: DocumentMetadata = {
      id: documentId,
      business_object_type: "expense_ticket",
      business_object_id: ticketId,
      owner_user_id: requester.id,
      classification: "finance",
      document_type: "receipt",
      current_version: 1,
      file_name: "receipt.pdf",
      storage_key: storageKey,
      mime_type: "application/pdf",
      size_bytes: 7,
      checksum_sha256: null,
      metadata: {},
      created_by_user_id: requester.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    store.documents.push(document);
    store.expenseDocuments.push({
      id: randomUUID(), ticket_id: ticketId, document_id: documentId,
      document_type: "receipt", verification_status: "verified",
      uploaded_by: requester.id, uploaded_at: new Date().toISOString(),
    });
    const objectStorage = new MemoryObjectStorage();
    await objectStorage.putObject(storageKey, Buffer.from("receipt"));
    store.objectStorage = objectStorage;
    const service = new DocumentService(store);
    const actor = (user: typeof admin): AuthUser => ({ ...user, roles: [...user.roles] });
    const put = vi.spyOn(objectStorage, "putObject");
    const remove = vi.spyOn(objectStorage, "removeObject");
    const newUpload = (parentId = ticketId) => ({
      business_object_type: "expense_ticket", business_object_id: parentId,
      classification: "finance" as const, document_type: "receipt", file_name: "new.pdf",
      mime_type: "application/pdf", size_bytes: 7, file_buffer: Buffer.from("receipt"),
    });
    const before = { documents: store.documents.length, links: store.expenseDocuments.length, outbox: store.outbox.length };
    await expect(service.upload(actor(auditor), newUpload())).rejects.toThrow(/upload denied/u);
    await expect(service.upload(actor(unrelated), newUpload())).rejects.toThrow(/upload denied/u);
    await expect(service.upload(actor(admin), newUpload(randomUUID()))).rejects.toThrow(/not found/u);
    ticket.status = ExpenseStatuses.ManagerRejected;
    await expect(service.upload(actor(admin), newUpload())).rejects.toThrow(/no longer accepts/u);
    ticket.status = ExpenseStatuses.Draft;
    await expect(service.delete(actor(admin), documentId)).rejects.toThrow(/parent-authorized workflow/u);
    expect(() => service.verify(actor(auditor), documentId)).toThrow(/expense workflow/u);
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(before.documents);
    expect(store.expenseDocuments).toHaveLength(before.links);
    expect(store.outbox).toHaveLength(before.outbox);

    const managerUpload = await service.upload(actor(manager), newUpload());
    expect(managerUpload.business_object_id).toBe(ticketId);
    expect(store.expenseDocuments.some((item) => item.document_id === managerUpload.id)).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);

    expect(service.metadata(actor(auditor), documentId).id).toBe(documentId);
    await expect(service.downloadContent(actor(auditor), documentId)).rejects.toThrow(/access denied/u);
    await expect(service.downloadUrl(actor(auditor), documentId)).rejects.toThrow(/access denied/u);
    for (const user of [admin, finance, manager, requester]) {
      expect((await service.downloadContent(actor(user), documentId)).body.toString()).toBe("receipt");
    }
    await expect(service.downloadContent(actor(unrelated), documentId)).rejects.toThrow(/access denied/u);
    document.classification = "medical";
    await expect(service.downloadContent(actor(admin), documentId)).rejects.toThrow(/access denied/u);
    document.classification = "finance";
    document.document_type = "mismatched_type";
    await expect(service.downloadContent(actor(manager), documentId)).rejects.toThrow(/access denied/u);
    document.document_type = "receipt";

    // An Auditor who also holds a current Admin assignment keeps Admin access.
    auditor.roles.push(Roles.Admin);
    expect((await service.downloadContent(actor(auditor), documentId)).body.toString()).toBe("receipt");
    auditor.roles.pop();

    // Durable requester identity survives a company transfer; company roles do not.
    for (const user of [requester, admin, auditor, manager, finance]) {
      const preference = store.userSessionPreferences.find((item) => item.user_id === user.id);
      if (!preference) throw new Error("Missing fixture preference");
      preference.company_id = companyB.id;
    }
    const afterTransfer = { documents: store.documents.length, links: store.expenseDocuments.length, outbox: store.outbox.length };
    await expect(service.upload(actor(admin), newUpload())).rejects.toThrow(/not found/u);
    expect(put).toHaveBeenCalledTimes(1);
    expect(store.documents).toHaveLength(afterTransfer.documents);
    expect(store.expenseDocuments).toHaveLength(afterTransfer.links);
    expect(store.outbox).toHaveLength(afterTransfer.outbox);
    expect((await service.downloadContent(actor(requester), documentId)).body.toString()).toBe("receipt");
    for (const user of [admin, auditor, manager, finance]) {
      await expect(service.downloadContent(actor(user), documentId)).rejects.toThrow(/access denied/u);
    }

    // A legacy link with contradictory metadata must not fall through to generic policy.
    document.business_object_type = "employee";
    document.business_object_id = requester.id;
    await expect(service.downloadContent(actor(requester), documentId)).rejects.toThrow(/access denied/u);
    expect(() => service.metadata(actor(requester), documentId)).toThrow(/access denied/u);
  });
});
