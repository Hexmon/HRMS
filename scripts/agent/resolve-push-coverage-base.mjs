#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workflowFile = "branch-ci-cd.yml";
const coverageJob = "Changed executable coverage";
const shaPattern = /^[0-9a-f]{40}$/i;
const bootstrapVariables = {
  dev: "DEV_HRMS_COVERAGE_BOOTSTRAP_SHA",
  qa: "QA_HRMS_COVERAGE_BOOTSTRAP_SHA",
  main: "MAIN_HRMS_COVERAGE_BOOTSTRAP_SHA",
};

export function bootstrapShaForBranch(branch, env) {
  const name = bootstrapVariables[branch];
  return name ? env[name] : undefined;
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function validateAncestor(root, sha, head, label, strict = false) {
  if (!shaPattern.test(sha)) throw new Error(`Invalid ${label} SHA`);
  const normalizedSha = sha.toLowerCase();
  if (strict && normalizedSha === head) throw new Error(`${label} SHA must precede push head`);
  const commit = spawnSync("git", ["cat-file", "-e", `${normalizedSha}^{commit}`], { cwd: root, stdio: "ignore" });
  if (commit.status !== 0) throw new Error(`${label} SHA is absent from checkout history`);
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", normalizedSha, head], { cwd: root, stdio: "ignore" });
  if (ancestor.status !== 0) throw new Error(`${label} SHA is not an ancestor of push head`);
  return normalizedSha;
}

export async function resolvePushCoverageBase({ root, repository, branch, head, runId, runNumber, requestJson, bootstrapSha }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !["dev", "qa", "main"].includes(branch) ||
      !shaPattern.test(head) || !Number.isSafeInteger(runId) || runId <= 0 ||
      !Number.isSafeInteger(runNumber) || runNumber <= 0 || typeof requestJson !== "function") {
    throw new Error("Invalid push coverage baseline context");
  }
  const normalizedHead = head.toLowerCase();
  if (git(root, "rev-parse", "HEAD") !== normalizedHead) throw new Error("Push coverage head does not match checked-out HEAD");

  let complete = false;
  let previousPageLast = Infinity;
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({ branch, event: "push", status: "success", per_page: "100", page: String(page) });
    const result = await requestJson(`/repos/${repository}/actions/workflows/${workflowFile}/runs?${query}`);
    if (!Array.isArray(result?.workflow_runs) || result.workflow_runs.length > 100) {
      throw new Error("Malformed GitHub workflow runs response");
    }
    const ordered = [...result.workflow_runs].sort((a, b) => b.run_number - a.run_number);
    for (const run of ordered) {
      if (!Number.isSafeInteger(run.run_number) || !Number.isSafeInteger(run.id)) {
        throw new Error("Malformed GitHub workflow run metadata");
      }
    }
    if (ordered.length && ordered[0].run_number > previousPageLast) {
      throw new Error("GitHub workflow runs are out of newest-first page order");
    }
    if (ordered.length) previousPageLast = ordered.at(-1).run_number;
    for (const run of ordered) {
      if (run.id === runId || run.run_number >= runNumber || run.event !== "push" ||
          run.head_branch !== branch || run.status !== "completed" || run.conclusion !== "success") continue;
      const jobs = await requestJson(`/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
      if (!Array.isArray(jobs?.jobs) || !Number.isSafeInteger(jobs.total_count) || jobs.total_count > 100) {
        throw new Error(`Malformed or oversized GitHub jobs response for run ${run.id}`);
      }
      const matches = jobs.jobs.filter((job) => job.name === coverageJob);
      if (matches.length > 1) throw new Error(`Ambiguous changed-coverage jobs for run ${run.id}`);
      if (matches.length === 0 || matches[0].conclusion !== "success" || matches[0].status !== "completed") continue;
      const base = validateAncestor(root, run.head_sha, normalizedHead, `Baseline for run ${run.id}`);
      return { base, runId: run.id };
    }
    if (ordered.length < 100) {
      complete = true;
      break;
    }
  }
  if (!complete) throw new Error("Push coverage baseline search exceeded 1000 successful runs");
  if (bootstrapSha !== undefined && bootstrapSha !== "") {
    const base = validateAncestor(root, bootstrapSha, normalizedHead, `Owner bootstrap for ${branch}`, true);
    return { base, runId: null };
  }
  throw new Error(`No prior successful ${branch} push run with a successful changed-coverage job`);
}

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitHub Actions API returned HTTP ${response.status}`);
  return response.json();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.GITHUB_EVENT_NAME !== "push" || !process.env.GITHUB_TOKEN) {
      throw new Error("Push event and GITHUB_TOKEN with Actions read permission are required");
    }
    const result = await resolvePushCoverageBase({
      root: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
      repository: process.env.GITHUB_REPOSITORY,
      branch: process.env.GITHUB_REF_NAME,
      head: process.env.GITHUB_SHA,
      runId: Number(process.env.GITHUB_RUN_ID),
      runNumber: Number(process.env.GITHUB_RUN_NUMBER),
      requestJson: (path) => githubJson(path, process.env.GITHUB_TOKEN),
      bootstrapSha: bootstrapShaForBranch(process.env.GITHUB_REF_NAME, process.env),
    });
    console.error(result.runId === null
      ? `Using owner-provided ${process.env.GITHUB_REF_NAME} bootstrap commit as cumulative push baseline.`
      : `Using successful coverage run ${result.runId} at ${result.base} as cumulative push baseline.`);
    process.stdout.write(`base=${result.base}\n`);
  } catch (error) {
    console.error(`Push coverage baseline resolution failed: ${error.message}`);
    process.exitCode = 1;
  }
}
