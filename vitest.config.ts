import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const setupFiles = ["./scripts/test-setup.ts"];

export default defineConfig({
  resolve: {
    alias: {
      "#shared": `${root}src/shared/index.ts`,
      "#auth": `${root}src/auth/index.ts`,
      "#db": `${root}src/db/index.ts`,
      "#testing": `${root}src/testing/index.ts`
    }
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles,
    testTimeout: 15000,
    fileParallelism: false,
    pool: "forks",
    projects: [
      {
        test: {
          name: "unit",
          setupFiles,
          testTimeout: 15000,
          include: [
            "src/**/*.unit.test.ts"
          ]
        }
      },
      {
        test: {
          name: "integration",
          setupFiles,
          testTimeout: 30000,
          include: [
            "src/**/*.integration.test.ts"
          ]
        }
      },
      {
        test: {
          name: "contracts",
          setupFiles,
          testTimeout: 30000,
          include: [
            "src/**/*.contract.test.ts"
          ]
        }
      },
      {
        test: {
          name: "e2e",
          setupFiles,
          testTimeout: 30000,
          include: [
            "src/**/*.e2e.test.ts"
          ]
        }
      }
    ]
  }
});
