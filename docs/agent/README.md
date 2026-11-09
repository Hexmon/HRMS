# Agent Engineering Guide

This directory explains how human developers and coding agents apply the same Hawkaii HRMS engineering controls.

## Canonical Order

1. Root `AGENTS.md` for repository-wide invariants and working agreement.
2. The nearest nested `AGENTS.md` for backend or frontend conventions.
3. Approved product, architecture, security, process, deployment, and runbook documents indexed by `docs/README.md`.
4. The applicable workflow under `.agents/skills/`.
5. Task-specific user instructions.

Agent memory, old chat context, stale handoff notes, and inferred behavior are not authoritative requirements.

## Supporting Policies

- `evidence-policy.md`: how to distinguish intent, implementation, runtime evidence, and inference.
- `environment-safety.md`: authorization and safety boundaries for local, hosted, and production operations.
- `verification-matrix.md`: minimum checks by change type and release-level verification.

Vendor adapters such as `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` are deliberately short. They point to this shared system rather than maintaining competing copies.
