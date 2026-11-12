import { useEffect, useState } from "react";
import { apiBlobRequest } from "@/shared/api/client";
import { apiConfig } from "@/shared/api/config";

const PRIVATE_DOCUMENT_PATH = /^\/api\/v1\/documents\/[0-9a-f-]+\/content$/iu;

export function privateDocumentApiPath(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const apiBase = new URL(apiConfig.baseUrl);
    const candidate = new URL(value, apiBase.origin);
    if (candidate.origin !== apiBase.origin || !PRIVATE_DOCUMENT_PATH.test(candidate.pathname)) {
      return null;
    }
    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return null;
  }
}

export function usePrivateDocumentUrl(source: string | null | undefined): string | undefined {
  const privatePath = privateDocumentApiPath(source);
  const [resolved, setResolved] = useState<string | undefined>(() =>
    privatePath ? undefined : source || undefined,
  );

  useEffect(() => {
    if (!privatePath) {
      setResolved(source || undefined);
      return;
    }
    let active = true;
    let objectUrl: string | undefined;
    setResolved(undefined);
    void apiBlobRequest(privatePath)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      })
      .catch(() => {
        if (active) setResolved(undefined);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [privatePath, source]);

  return resolved;
}
