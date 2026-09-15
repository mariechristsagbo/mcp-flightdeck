# MCP Flightdeck

**Deterministic testing and replay for MCP servers.**

MCP Flightdeck helps teams build, test, version, and review Model Context Protocol (MCP) servers before agents use them in production.

It is not another MCP browser. Its focus is a repeatable reliability loop:

```text
connect → inspect → record → workflow → assert → replay → diff → CI
```

## Why

An MCP server can behave differently depending on its client, transport, negotiated capabilities, authorization, and version. A manual inspector can show a tool once; it cannot reliably answer:

- Did this server change in a way that breaks a workflow?
- Did a previously read-only tool gain write-capable behavior?
- Can this incident be replayed without copying incomplete logs or secrets?
- Does the same protocol interaction behave differently across clients?

MCP Flightdeck will create durable, redacted artifacts for answering those questions.

## Product primitives

- **Workflows** — versioned, reproducible MCP scenarios with assertions.
- **Recorder** — ordered, redacted protocol traces of MCP sessions.
- **Contracts** — capability snapshots and semantic diffs for tools, resources, prompts, schemas, and behavior-relevant metadata.
- **Policies** — review rules and CI gates for unsafe or breaking changes.

## Current CLI

The first command inspects a local MCP server over stdio. It negotiates `initialize`, sends `notifications/initialized`, and lists the negotiated tools, resources, and prompts as JSON.

```bash
npm run flightdeck -- inspect --command <server-command> --arg <server-argument>
```

Use one `--arg` per server argument. The current command has a 10-second request timeout; override it with `--timeout <milliseconds>` when needed. It supports only local stdio servers today—remote Streamable HTTP/SSE and OAuth are not implemented.

## Planned CLI

```bash
flightdeck record --server staging
flightdeck workflow create --from-run run_01...
flightdeck test .flightdeck/workflows/search-customer.yaml
flightdeck contract diff --baseline origin/main
flightdeck policy check --policy .flightdeck/policies/production.yaml
```

The commands above are planned and may change before the first release.

## Status

Early-stage open-source project. The first implementation target is:

```text
connect → inspect → record → replay
```

A workflow runner, contract diff, and policy gates follow once the trace format is stable and covered by real MCP fixtures.

## Principles

- **Protocol evidence over screenshots.** Capture the actual interaction, including timing and negotiated capabilities.
- **Deterministic by default.** Workflows must run locally and in CI without a hosted control plane.
- **Safe artifacts.** Redact secrets before persistence, sharing, or export.
- **Git-native.** Workflows, contracts, and policies are human-readable and versionable.
- **MCP-native semantics.** A change to a tool description, side effect, or authorization scope can matter as much as a schema diff.

## Architecture direction

The project will be a TypeScript monorepo with a CLI-first core. The initial boundaries are intentionally small:

```text
packages/
  protocol/     MCP transport adapters and normalized events
  recorder/     trace capture, redaction, and persistence
  workflow/     workflow parsing, execution, and assertions
  contracts/    snapshots and semantic diffs
  policy/       deterministic policy evaluation
  fixtures/     controlled MCP servers for integration tests
apps/
  cli/          flightdeck command-line interface
```

A Web interface may be added later to inspect timelines, compare runs, and share incident artifacts. It is not part of the first milestone.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), then review the repository guidelines before opening a pull request.

Please do not report vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).

## License

MCP Flightdeck is licensed under the [MIT License](./LICENSE).
