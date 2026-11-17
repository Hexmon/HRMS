import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repositoryRoot = join(packageRoot, "..");

const generatedMirrors = [
  {
    canonical: join(packageRoot, "docs", "api", "openapi.json"),
    mirrors: [
      join(packageRoot, "docs", "api", "frontend-contract", "openapi.json"),
      join(repositoryRoot, "hrms-client", "docs", "api", "openapi.json"),
      join(repositoryRoot, "hrms-client", "docs", "api", "frontend-contract", "openapi.json"),
    ],
  },
  {
    canonical: join(packageRoot, "docs", "api", "frontend-contract", "ENDPOINT_INDEX.md"),
    mirrors: [
      join(repositoryRoot, "hrms-client", "docs", "api", "frontend-contract", "ENDPOINT_INDEX.md"),
    ],
  },
] as const;

describe("generated API contract mirrors", () => {
  for (const group of generatedMirrors) {
    for (const mirror of group.mirrors) {
      it(`${mirror} matches ${group.canonical}`, () => {
        expect(readFileSync(mirror, "utf8")).toBe(readFileSync(group.canonical, "utf8"));
      });
    }
  }

  it("documents the Holiday create, retry, update, and missing-ID version contract", () => {
    const contract = JSON.parse(
      readFileSync(join(packageRoot, "docs", "api", "openapi.json"), "utf8"),
    ) as {
      paths: Record<
        string,
        {
          put?: {
            description?: string;
            requestBody?: {
              content?: Record<
                string,
                { schema?: { properties?: Record<string, { description?: string }> } }
              >;
            };
          };
        }
      >;
    };
    const operation = contract.paths["/api/v1/holidays/{id}"]?.put;
    const versionDescription =
      operation?.requestBody?.content?.["application/json"]?.schema?.properties?.expected_version
        ?.description;

    expect(operation?.description).toMatch(
      /Retrying the same ID and normalized body returns the current holiday without another version or event/u,
    );
    expect(operation?.description).toContain("missing ID with expected_version");
    expect(versionDescription).toContain("Required when changing an existing holiday");
    expect(versionDescription).toContain("missing ID with this field returns 404");
  });
});
