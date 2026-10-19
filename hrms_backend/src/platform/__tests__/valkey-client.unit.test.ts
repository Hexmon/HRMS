import { describe, expect, it } from "vitest";
import { createValkeyClient, validateValkeyUrl } from "../valkey-client.js";

describe("Valkey client configuration", () => {
  it.each([
    "redis://127.0.0.1:6379",
    "rediss://default:token@example.upstash.io:6379",
  ])("accepts TCP Redis URLs: %s", (value) => {
    expect(validateValkeyUrl(value)).toBe(value);
  });

  it.each([
    "https://example.upstash.io",
    "not-a-url",
    "postgresql://example.test/database",
  ])("rejects non-TCP Redis URLs: %s", (value) => {
    expect(() => validateValkeyUrl(value)).toThrow(/redis:\/\/ or rediss:\/\//u);
  });

  it("creates a lazy client without opening a connection", () => {
    const client = createValkeyClient("rediss://default:token@example.upstash.io:6379");
    expect(client.status).toBe("wait");
    client.disconnect();
  });
});
