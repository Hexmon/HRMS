import http from "node:http";
import { spawn } from "node:child_process";

// Playwright runs in a container on hosts whose distro has no pinned browser
// binary. Forward the host Vite server through localhost so browser WebCrypto
// remains available, as it is on HTTPS production origins.
const upstreamHost = process.env.E2E_HOST_GATEWAY ?? "hostmachine";
const upstreamPort = Number(process.env.E2E_FRONTEND_PORT ?? 5173);
const localPort = Number(process.env.E2E_LOCAL_PROXY_PORT ?? 5173);
function proxyServer(remotePort, hostHeader) {
  return http.createServer((request, response) => {
    const upstream = http.request({
      hostname: upstreamHost,
      port: remotePort,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: hostHeader },
    }, (received) => {
      response.writeHead(received.statusCode ?? 502, received.headers);
      received.pipe(response);
    });
    upstream.on("error", (error) => {
      response.writeHead(502);
      response.end(`Local proxy failed: ${error.message}`);
    });
    request.pipe(upstream);
  });
}

const server = proxyServer(upstreamPort, `${upstreamHost}:${upstreamPort}`);
const workerPort = process.env.E2E_WORKER_UPSTREAM_PORT ? Number(process.env.E2E_WORKER_UPSTREAM_PORT) : null;
const workerServer = workerPort ? proxyServer(workerPort, `127.0.0.1:${workerPort}`) : null;

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(localPort, "127.0.0.1", resolve);
});
if (workerServer && workerPort) {
  await new Promise((resolve, reject) => {
    workerServer.once("error", reject);
    workerServer.listen(workerPort, "127.0.0.1", resolve);
  });
}

const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    E2E_SKIP_WEB_SERVER: "1",
    E2E_BASE_URL: `http://localhost:${localPort}`,
    E2E_API_BASE_URL: process.env.E2E_API_BASE_URL ?? `http://${upstreamHost}:3001`,
    ...(workerPort ? { E2E_WORKER_BASE_URL: `http://127.0.0.1:${workerPort}` } : {}),
  },
});
const status = await new Promise((resolve) => child.once("exit", resolve));
await new Promise((resolve) => server.close(resolve));
if (workerServer) await new Promise((resolve) => workerServer.close(resolve));
process.exitCode = status ?? 1;
