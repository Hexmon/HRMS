# Performance And Recovery

No capacity/SLA claim from 100–150 users alone. Plan representative concurrent attendance, approvals, uploads, reports and login with growing tenant history; measure p95/p99, RSS/event loop/CPU, SQL queries/pool wait/locks, Redis commands/latency, object bytes and queue age/retries/DLQ. Targets require approval.

Failure cases need real isolated infrastructure for transaction/lock/RLS, Redis expiry/outage/reconnect, queue replay, uncertain provider sends and late object completion. Mocked unit tests establish only control flow. Use explicit bounds, cleanup and recovery; never use production for load/security probes.
