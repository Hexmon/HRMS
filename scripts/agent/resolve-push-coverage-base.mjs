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
  const rawGitEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" };
  const object = spawnSync("git", ["cat-file", "-t", normalizedSha], {
    cwd: root, env: rawGitEnv, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  if (object.status !== 0) throw new Error(`${label} SHA is absent from checkout history`);
  if (object.stdout.trim() !== "commit") throw new Error(`${label} SHA must identify a commit object directly`);
  if (strict && normalizedSha === head) throw new Error(`${label} SHA must precede push head`);
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", normalizedSha, head], { cwd: root, env: rawGitEnv, stdio: "ignore" });
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

export async function githubJson(path, token, fetchImplementation = fetch) {
  const response = await fetchImplementation(`https://api.github.com${path}`, {
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

export async function main(environment, dependencies, io) {
    if (environment.GITHUB_EVENT_NAME !== "push" || !environment.GITHUB_TOKEN) {
      throw new Error("Push event and GITHUB_TOKEN with Actions read permission are required");
    }
    const result = await resolvePushCoverageBase({
      root: dependencies.root,
      repository: environment.GITHUB_REPOSITORY,
      branch: environment.GITHUB_REF_NAME,
      head: environment.GITHUB_SHA,
      runId: Number(environment.GITHUB_RUN_ID),
      runNumber: Number(environment.GITHUB_RUN_NUMBER),
      requestJson: dependencies.requestJson,
      bootstrapSha: bootstrapShaForBranch(environment.GITHUB_REF_NAME, environment),
    });
    io.error(result.runId === null
      ? `Using owner-provided ${environment.GITHUB_REF_NAME} bootstrap commit as cumulative push baseline.`
      : `Using successful coverage run ${result.runId} at ${result.base} as cumulative push baseline.`);
    io.output(`base=${result.base}\n`);
    return result;
}

export function createDefaultCliDependencies(environment = process.env, fetchImplementation = fetch) {
  return {
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
    requestJson: (path) => githubJson(path, environment.GITHUB_TOKEN, fetchImplementation),
  };
}

export function createDefaultCliIo(
  error = (message) => console.error(message),
  output = (message) => process.stdout.write(message),
) {
  return { error, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.env, createDefaultCliDependencies(), createDefaultCliIo());
  } catch (error) {
    console.error(`Push coverage baseline resolution failed: ${error.message}`);
    process.exitCode = 1;
  }
}
