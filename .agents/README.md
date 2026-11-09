# Shared Agent Workflows

`AGENTS.md` is the canonical always-on repository contract. This directory contains task-specific procedures and portable specialist role definitions so capable coding agents can use the same engineering workflow without duplicating the full policy in vendor-specific files.

## Layout

- `skills/<name>/SKILL.md`: reusable workflow loaded when its description matches the task.
- `specialists/*.md`: portable role definitions for review or delegated work; invocation syntax is tool-specific.

Skills guide decisions and evidence. Required controls are enforced by repository scripts, CI, protected environments, and human approvals rather than agent compliance alone.
