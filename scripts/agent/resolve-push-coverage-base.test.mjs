import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { bootstrapShaForBranch, createDefaultCliDependencies, createDefaultCliIo, githubJson, main, resolvePushCoverageBase } from "./resolve-push-coverage-base.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "Coverage Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Coverage Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" },
  }).trim();
}

function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function history() {
  const root = mkdtempSync(join(tmpdir(), "hrms-push-baseline-"));
  roots.push(root);
  git(root, "init", "-q");
  write(root, "hrms_backend/src/guard.ts", "export const allowed = false;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "A previously covered");
  const A = git(root, "rev-parse", "HEAD");
  write(root, "hrms_backend/src/guard.ts", "export const allowed = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "B failed code push");
  const B = git(root, "rev-parse", "HEAD");
  write(root, "README.md", "C documentation only\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "C docs push");
  return { root, A, B, C: git(root, "rev-parse", "HEAD") };
}

function run(id, runNumber, headSha, conclusion = "success") {
  return { id, run_number: runNumber, head_sha: headSha, head_branch: "dev", event: "push", status: "completed", conclusion };
}

function api(runs, jobs = {}) {
  const calls = [];
  const requestJson = async (path) => {
    calls.push(path);
    const url = new URL(path, "https://api.github.com");
    if (url.pathname.endsWith("/runs")) {
      assert.match(url.pathname, /\/actions\/workflows\/branch-ci-cd\.yml\/runs$/);
      assert.equal(url.searchParams.get("branch"), "dev");
      assert.equal(url.searchParams.get("event"), "push");
      assert.equal(url.searchParams.get("status"), "success");
      assert.equal(url.searchParams.get("per_page"), "100");
      return { workflow_runs: runs };
    }
    const id = Number(url.pathname.match(/\/runs\/(\d+)\/jobs$/)?.[1]);
    assert.equal(url.searchParams.get("filter"), "latest");
    return { total_count: jobs[id]?.length ?? 0, jobs: jobs[id] ?? [] };
  };
  return { requestJson, calls };
}

function context({ root, C }, requestJson) {
  return { root, repository: "Hexmon/HRMS", branch: "dev", head: C, runId: 103, runNumber: 3, requestJson };
}

test("failed code push B remains in docs-only C coverage diff by using successful A", async () => {
  const commits = history();
  assert.deepEqual(git(commits.root, "diff", "--name-only", commits.B, commits.C).split("\n"), ["README.md"]);
  assert.deepEqual(git(commits.root, "diff", "--name-only", commits.A, commits.C).split("\n"), ["README.md", "hrms_backend/src/guard.ts"]);
  const { requestJson, calls } = api([
    run(102, 2, commits.B, "failure"),
    run(101, 1, commits.A),
  ], {
    101: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }],
    102: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }],
  });
  const result = await resolvePushCoverageBase(context(commits, requestJson));
  assert.deepEqual(result, { base: commits.A, runId: 101 });
  assert.equal(calls.some((path) => path.includes("/runs/102/jobs")), false);
});

test("latest successful coverage run becomes baseline, while skipped jobs fall back", async () => {
  const commits = history();
  const runs = [run(102, 2, commits.B), run(101, 1, commits.A)];
  const success = [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }];
  const latest = api(runs, { 101: success, 102: success });
  assert.deepEqual(await resolvePushCoverageBase(context(commits, latest.requestJson)), { base: commits.B, runId: 102 });
  const upperRun = api([run(102, 2, commits.B.toUpperCase())], { 102: success });
  assert.deepEqual(await resolvePushCoverageBase(context(commits, upperRun.requestJson)), { base: commits.B, runId: 102 });
  const skipped = api(runs, { 101: success, 102: [{ name: "Changed executable coverage", status: "completed", conclusion: "skipped" }] });
  assert.deepEqual(await resolvePushCoverageBase(context(commits, skipped.requestJson)), { base: commits.A, runId: 101 });
  assert.deepEqual(await resolvePushCoverageBase({ ...context(commits, latest.requestJson), bootstrapSha: commits.A }), { base: commits.B, runId: 102 });
  assert.deepEqual(await resolvePushCoverageBase({ ...context(commits, latest.requestJson), bootstrapSha: "stale-invalid-value" }), { base: commits.B, runId: 102 });
});

test("a valid first-page coverage run avoids a full historical search", async () => {
  const commits = history();
  const pages = [];
  const requestJson = async (path) => {
    const url = new URL(path, "https://api.github.com");
    if (url.pathname.endsWith("/runs")) {
      pages.push(Number(url.searchParams.get("page")));
      return { workflow_runs: [run(102, 2, commits.B),
        ...Array.from({ length: 99 }, (_, index) => run(200 + index, 100 + index, commits.A))] };
    }
    return { total_count: 1, jobs: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }] };
  };
  assert.deepEqual(await resolvePushCoverageBase(context(commits, requestJson)), { base: commits.B, runId: 102 });
  assert.deepEqual(pages, [1]);
});

test("workflow run search follows bounded pagination", async () => {
  const commits = history();
  const pages = [];
  const requestJson = async (path) => {
    const url = new URL(path, "https://api.github.com");
    if (url.pathname.endsWith("/runs")) {
      const page = Number(url.searchParams.get("page"));
      pages.push(page);
      return { workflow_runs: page === 1
        ? Array.from({ length: 100 }, (_, index) => run(200 + index, 100 + index, commits.A))
        : [run(101, 1, commits.A)] };
    }
    return { total_count: 1, jobs: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }] };
  };
  assert.deepEqual(await resolvePushCoverageBase(context(commits, requestJson)), { base: commits.A, runId: 101 });
  assert.deepEqual(pages, [1, 2]);
});

test("missing successful baseline fails instead of using github.event.before", async () => {
  const commits = history();
  const { requestJson } = api([]);
  await assert.rejects(resolvePushCoverageBase(context(commits, requestJson)), /No prior successful dev push run/);
});

test("head mismatch, ambiguous coverage jobs, and an unbounded history fail closed", async () => {
  const commits = history();
  const noRuns = api([]);
  await assert.rejects(resolvePushCoverageBase({
    ...context(commits, noRuns.requestJson),
    head: commits.B,
  }), /head does not match checked-out HEAD/);

  const ambiguous = api([run(101, 1, commits.A)], {
    101: [
      { name: "Changed executable coverage", status: "completed", conclusion: "success" },
      { name: "Changed executable coverage", status: "completed", conclusion: "success" },
    ],
  });
  await assert.rejects(resolvePushCoverageBase(context(commits, ambiguous.requestJson)), /Ambiguous changed-coverage jobs/);

  const requestJson = async (path) => {
    if (path.includes("/jobs?")) return { total_count: 0, jobs: [] };
    const page = Number(new URL(path, "https://api.github.com").searchParams.get("page"));
    return { workflow_runs: Array.from({ length: 100 }, (_, index) =>
      run(page * 1_000 + index, 20_000 - ((page - 1) * 100) - index, commits.A)) };
  };
  await assert.rejects(resolvePushCoverageBase(context(commits, requestJson)), /exceeded 1000 successful runs/);
});

test("owner bootstrap A covers failed B and docs-only C when no run qualifies", async () => {
  const commits = history();
  const { requestJson } = api([]);
  const result = await resolvePushCoverageBase({ ...context(commits, requestJson), bootstrapSha: commits.A });
  assert.deepEqual(result, { base: commits.A, runId: null });
  assert.deepEqual(await resolvePushCoverageBase({ ...context(commits, requestJson), head: commits.C.toUpperCase(), bootstrapSha: commits.A.toUpperCase() }), { base: commits.A, runId: null });
  assert.deepEqual(git(commits.root, "diff", "--name-only", result.base, commits.C).split("\n"), ["README.md", "hrms_backend/src/guard.ts"]);
  const skipped = api([run(102, 2, commits.B)], {
    102: [{ name: "Changed executable coverage", status: "completed", conclusion: "skipped" }],
  });
  assert.deepEqual(await resolvePushCoverageBase({ ...context(commits, skipped.requestJson), bootstrapSha: commits.A }), { base: commits.A, runId: null });
});

test("bootstrap variables are selected only for their matching branch", () => {
  const env = {
    DEV_HRMS_COVERAGE_BOOTSTRAP_SHA: "a".repeat(40),
    QA_HRMS_COVERAGE_BOOTSTRAP_SHA: "b".repeat(40),
    MAIN_HRMS_COVERAGE_BOOTSTRAP_SHA: "c".repeat(40),
  };
  assert.equal(bootstrapShaForBranch("dev", env), env.DEV_HRMS_COVERAGE_BOOTSTRAP_SHA);
  assert.equal(bootstrapShaForBranch("qa", env), env.QA_HRMS_COVERAGE_BOOTSTRAP_SHA);
  assert.equal(bootstrapShaForBranch("main", env), env.MAIN_HRMS_COVERAGE_BOOTSTRAP_SHA);
  assert.equal(bootstrapShaForBranch("release-01", env), undefined);
});

test("missing, invalid, equal-head and nonancestor bootstrap values fail closed", async () => {
  const commits = history();
  const { requestJson } = api([]);
  await assert.rejects(resolvePushCoverageBase(context(commits, requestJson)), /No prior successful/);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, requestJson), bootstrapSha: "not-a-sha" }), /Invalid Owner bootstrap/);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, requestJson), bootstrapSha: "a".repeat(40) }), /absent from checkout history/);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, requestJson), bootstrapSha: commits.C }), /must precede push head/);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, requestJson), bootstrapSha: commits.C.toUpperCase() }), /must precede push head/);
  const branch = git(commits.root, "branch", "--show-current");
  git(commits.root, "switch", "-qc", "diverged", commits.A);
  write(commits.root, "README.md", "alternate\n");
  git(commits.root, "add", ".");
  git(commits.root, "commit", "-qm", "alternate bootstrap");
  const divergent = git(commits.root, "rev-parse", "HEAD");
  git(commits.root, "switch", "-q", branch);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, requestJson), bootstrapSha: divergent }), /not an ancestor/);
});

test("annotated tag object SHAs cannot replace commit baselines", async () => {
  const commits = history();
  git(commits.root, "tag", "-a", "-m", "tag current head", "tag-current", commits.C);
  git(commits.root, "tag", "-a", "-m", "tag ancestor", "tag-ancestor", commits.A);
  const tagCurrent = git(commits.root, "rev-parse", "refs/tags/tag-current");
  const tagAncestor = git(commits.root, "rev-parse", "refs/tags/tag-ancestor");
  assert.equal(git(commits.root, "cat-file", "-t", tagCurrent), "tag");
  assert.equal(git(commits.root, "cat-file", "-t", tagAncestor), "tag");
  const noRuns = api([]);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, noRuns.requestJson), bootstrapSha: tagCurrent }), /must identify a commit object directly/);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, noRuns.requestJson), bootstrapSha: tagAncestor }), /must identify a commit object directly/);
  const prior = api([run(101, 1, tagAncestor)], {
    101: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }],
  });
  await assert.rejects(resolvePushCoverageBase(context(commits, prior.requestJson)), /must identify a commit object directly/);
});

test("successful run on a nonancestor commit fails closed", async () => {
  const commits = history();
  const branch = git(commits.root, "branch", "--show-current");
  git(commits.root, "switch", "-qc", "diverged", commits.A);
  write(commits.root, "README.md", "diverged\n");
  git(commits.root, "add", ".");
  git(commits.root, "commit", "-qm", "alternate run");
  const diverged = git(commits.root, "rev-parse", "HEAD");
  git(commits.root, "switch", "-q", branch);
  const { requestJson } = api([run(102, 2, diverged), run(101, 1, commits.A)], {
    102: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }],
    101: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }],
  });
  await assert.rejects(resolvePushCoverageBase(context(commits, requestJson)), /not an ancestor/);
});

test("GitHub API errors fail closed", async () => {
  const commits = history();
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, async () => { throw new Error("API unavailable"); }), bootstrapSha: commits.A }), /API unavailable/);
  const requestJson = async (path) => {
    if (path.includes("/jobs?")) throw new Error("jobs API unavailable");
    return { workflow_runs: [run(101, 1, commits.A)] };
  };
  await assert.rejects(resolvePushCoverageBase(context(commits, requestJson)), /jobs API unavailable/);
});

test("malformed API data and absent checkout history fail closed", async () => {
  const commits = history();
  await assert.rejects(resolvePushCoverageBase(context(commits, async () => ({}))), /Malformed GitHub workflow runs/);
  const { requestJson } = api([run(101, 1, "a".repeat(40))], {
    101: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }],
  });
  await assert.rejects(resolvePushCoverageBase(context(commits, requestJson)), /absent from checkout history/);
  await assert.rejects(resolvePushCoverageBase({ ...context(commits, requestJson), repository: "invalid" }), /Invalid push coverage baseline context/);
  await assert.rejects(resolvePushCoverageBase(context(commits, async () => ({ workflow_runs: [{ ...run(101, 1, commits.A), id: "bad" }] }))), /Malformed GitHub workflow run metadata/);
  let page = 0;
  await assert.rejects(resolvePushCoverageBase(context(commits, async () => {
    page += 1;
    return { workflow_runs: page === 1
      ? Array.from({ length: 100 }, (_, index) => run(200 + index, 100 + index, commits.A))
      : [run(101, 500, commits.A)] };
  })), /newest-first page order/);
  const badJobs = api([run(101, 1, commits.A)], { 101: [] });
  const original = badJobs.requestJson;
  await assert.rejects(resolvePushCoverageBase(context(commits, async (path) => path.includes("/jobs")
    ? { total_count: 101, jobs: [] }
    : original(path))), /Malformed or oversized GitHub jobs response/);
});

test("GitHub request boundary accepts JSON and rejects HTTP failures", async () => {
  const calls = [];
  const value = await githubJson("/resource", "synthetic-token", async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ value: 1 }) };
  });
  assert.deepEqual(value, { value: 1 });
  assert.equal(calls[0].url, "https://api.github.com/resource");
  assert.equal(calls[0].options.headers.Authorization, "Bearer synthetic-token");
  await assert.rejects(githubJson("/resource", "synthetic-token", async () => ({ ok: false, status: 503 })), /HTTP 503/);
});

test("CLI core validates context and writes a resolved baseline", async () => {
  const commits = history();
  const { requestJson } = api([]);
  const errors = [];
  const output = [];
  const environment = {
    GITHUB_EVENT_NAME: "push",
    GITHUB_TOKEN: "synthetic-token",
    GITHUB_REPOSITORY: "Hexmon/HRMS",
    GITHUB_REF_NAME: "dev",
    GITHUB_SHA: commits.C,
    GITHUB_RUN_ID: "103",
    GITHUB_RUN_NUMBER: "3",
    DEV_HRMS_COVERAGE_BOOTSTRAP_SHA: commits.A,
  };
  const result = await main(environment, { root: commits.root, requestJson }, {
    error: (message) => errors.push(message),
    output: (message) => output.push(message),
  });
  assert.deepEqual(result, { base: commits.A, runId: null });
  assert.match(errors.join("\n"), /owner-provided dev bootstrap/);
  assert.deepEqual(output, [`base=${commits.A}\n`]);
  const successfulRunApi = api([run(101, 1, commits.A)], {
    101: [{ name: "Changed executable coverage", status: "completed", conclusion: "success" }],
  });
  const successfulRunErrors = [];
  const successful = await main({ ...environment, DEV_HRMS_COVERAGE_BOOTSTRAP_SHA: undefined },
    { root: commits.root, requestJson: successfulRunApi.requestJson },
    { error: (message) => successfulRunErrors.push(message), output() {} });
  assert.deepEqual(successful, { base: commits.A, runId: 101 });
  assert.match(successfulRunErrors.join("\n"), /successful coverage run 101/);
  await assert.rejects(main({}, { root: commits.root, requestJson }, { error() {}, output() {} }), /Push event and GITHUB_TOKEN/);

  const executable = new URL("./resolve-push-coverage-base.mjs", import.meta.url).pathname;
  const failed = spawnSync(process.execPath, [executable], {
    cwd: commits.root,
    env: {},
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Push coverage baseline resolution failed/);
});

test("default CLI boundaries delegate API requests and output without hiding values", async () => {
  const requests = [];
  const dependencies = createDefaultCliDependencies({ GITHUB_TOKEN: "boundary-token" }, async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  });
  assert.equal(git(dependencies.root, "rev-parse", "--show-toplevel"), dependencies.root);
  assert.deepEqual(await dependencies.requestJson("/repos/Hexmon/HRMS/actions/workflows/branch-ci-cd.yml/runs"), { workflow_runs: [] });
  assert.equal(requests[0].options.headers.Authorization, "Bearer boundary-token");

  const errors = [];
  const outputs = [];
  const io = createDefaultCliIo((message) => errors.push(message), (message) => outputs.push(message));
  io.error("diagnostic");
  io.output("base=abc\n");
  assert.deepEqual(errors, ["diagnostic"]);
  assert.deepEqual(outputs, ["base=abc\n"]);

  const originalError = console.error;
  const originalWrite = process.stdout.write;
  console.error = (message) => { errors.push(message); };
  process.stdout.write = (message) => { outputs.push(String(message)); return true; };
  try {
    const defaults = createDefaultCliIo();
    defaults.error("default diagnostic");
    defaults.output("base=default\n");
  } finally {
    console.error = originalError;
    process.stdout.write = originalWrite;
  }
  assert.equal(errors.at(-1), "default diagnostic");
  assert.equal(outputs.at(-1), "base=default\n");
});
