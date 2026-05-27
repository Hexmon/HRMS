import { spawn } from "node:child_process";
import { loadEnvFile } from "./env.js";

const separatorIndex = process.argv.indexOf("--");
if (separatorIndex === -1 || separatorIndex < 3) {
  throw new Error("Usage: tsx scripts/run-with-env.ts <env-file> -- <command> [args...]");
}

const envFile = process.argv[2];
const [command, ...args] = process.argv.slice(separatorIndex + 1);

if (!envFile) {
  throw new Error("Missing env file argument");
}

if (!command) {
  throw new Error("Missing command to run");
}

loadEnvFile(envFile, { required: true });

const child = spawn(command, args, {
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
