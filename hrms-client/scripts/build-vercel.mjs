import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.env.NITRO_PRESET = process.env.NITRO_PRESET || "vercel";

const command = process.platform === "win32" ? "vite.cmd" : "vite";
const child = spawn(command, ["build"], {
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("Failed to start the Vercel build:", error);
  process.exit(1);
});

child.on("exit", async (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  if (code !== 0) process.exit(code ?? 1);

  try {
    const entryPath = resolve(".vercel/output/functions/__server.func/index.mjs");
    const { default: handler } = await import(pathToFileURL(entryPath).href);
    const response = await handler.fetch(new Request("https://vercel-build.local/login"), {});
    const body = await response.text();

    if (response.status >= 500 || body.includes("This page didn't load")) {
      throw new Error(`SSR smoke request failed with HTTP ${response.status}`);
    }

    console.log(`Vercel SSR smoke check passed (HTTP ${response.status}).`);
    process.exit(0);
  } catch (error) {
    console.error("Vercel SSR smoke check failed:", error);
    process.exit(1);
  }
});
