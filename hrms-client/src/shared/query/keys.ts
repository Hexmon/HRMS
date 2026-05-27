type QueryKeyPart = string | number | boolean | null | undefined | Record<string, unknown>;

export const queryKeys = {
  all: ["api"] as const,
  domain: (domain: string) => [...queryKeys.all, domain] as const,
  list: (domain: string, resource: string, params?: QueryKeyPart) =>
    [...queryKeys.domain(domain), resource, "list", params ?? {}] as const,
  detail: (domain: string, resource: string, id: string | number, params?: QueryKeyPart) =>
    [...queryKeys.domain(domain), resource, "detail", id, params ?? {}] as const,
  action: (domain: string, resource: string, action: string, params?: QueryKeyPart) =>
    [...queryKeys.domain(domain), resource, action, params ?? {}] as const,
};
