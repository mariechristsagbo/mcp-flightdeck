# Architecture

## Purpose

MCP Flightdeck is a CLI-first reliability tool for Model Context Protocol (MCP) servers. Its first end-to-end capability is:

```text
connect → inspect → record → replay
```

The architecture optimizes for deterministic artifacts, local execution, and CI use before introducing a hosted service or a Web interface.

## Design decisions

### CLI-first, not UI-first

The command line is the first public interface because workflows, contract snapshots, traces, and policy checks must work locally and in continuous integration. A Web interface can consume the same artifacts later; it must not define their format.

### File-backed artifacts

The initial implementation does not require a database. Projects store durable artifacts in `.flightdeck/`:

```text
.flightdeck/
  config.yaml
  workflows/
  contracts/
  policies/
  runs/
```

Artifacts are versioned, human-inspectable where appropriate, and safe to use in Git after redaction.

### Explicit trust boundaries

MCP servers, transport responses, and trace payloads are untrusted input. Secret redaction happens before trace persistence or output. The project must never treat a captured trace as safe merely because it was produced locally.

### Deterministic behavior over automation magic

Workflow execution and policy evaluation should have predictable inputs, outputs, exit codes, and reports. Natural-language interpretation and agent-assisted analysis are optional future layers, never required for a CI gate.

## Proposed monorepo layout

```text
apps/
  cli/                 # `flightdeck` command-line interface
packages/
  protocol/            # normalized protocol events, wire codec, channel port
  transports/          # concrete transports implementing the channel port
  recorder/            # redaction, event ordering, trace persistence
  replay/              # replaying a recorded session against a channel
  workflow/            # parser, runner, variable resolution, assertions
  contracts/           # snapshots and semantic diffing
  policy/              # policy model and deterministic evaluation
  fixtures/            # controlled MCP servers for integration tests
docs/
  architecture.md
```

The packages model independent product primitives. The CLI composes them but does not contain protocol semantics itself.

Each package keeps one reason to change. `protocol` owns the event model and the
`MessageChannel` port; concrete transports implement that port without depending
on the layers that consume it, and `replay` drives the port instead of opening
connections itself.

## Event model

A normalized event is the boundary shared by the protocol, recorder, workflow, and comparison layers. It must preserve:

- monotonic timestamp;
- direction (`inbound` or `outbound`);
- transport metadata;
- JSON-RPC method, request id, result, error, or notification;
- redaction metadata;
- lifecycle state, including interrupted sessions.

The raw payload is retained only after structured redaction. Derived summaries must be reproducible from recorded events.

## Artifact formats

The first implementation will define three versioned formats:

| Artifact     | Purpose                                     | Initial storage |
| ------------ | ------------------------------------------- | --------------- |
| `fdtrace`    | Ordered, redacted protocol-session evidence | JSON            |
| `fdworkflow` | Reproducible interaction and assertions     | YAML            |
| `fdcontract` | Server capability and surface snapshot      | JSON            |

Each format carries a `formatVersion`. Format migrations must be explicit and tested.

## Transport support order

1. `stdio` — required for local server development and controlled fixtures.
2. Streamable HTTP — required for current remote MCP deployments.
3. Legacy SSE — supported after the two primary paths have reliable test coverage.

A transport adapter exposes normalized lifecycle and protocol events. It must not leak transport-specific implementation details into workflows.

Adapters translate through the wire codec in `protocol`: `encodeJsonRpcMessage` on the way out, `decodeJsonRpcMessage` on the way in. A frame that is not a valid JSON-RPC message fails the channel instead of reaching a trace as a validated message, and a transport whose peer disappears fails pending reads rather than letting a replay wait forever.

Fixtures are runnable processes, not mocks. `packages/fixtures` holds self-contained servers that speak the wire format over a real transport, so a transport change is tested against a real process boundary.

## Test strategy

The project uses test-driven development. Every behavior change starts with a focused failing test and ends with the relevant suite passing.

Fixtures are first-class packages, not ad-hoc test mocks. They will cover at least:

- successful initialization and discovery;
- tools, resources, and prompts;
- malformed protocol responses;
- protocol errors;
- timeout and cancellation;
- notifications and progress;
- missing capabilities;
- sensitive values requiring redaction;
- contract changes that represent increased risk.

## Derived lessons from existing MCP projects

The architecture borrows structural lessons, not source code, from the benchmarked open-source projects:

- [`modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector) separates shared protocol core, multiple clients, documentation, and composable test servers.
- [`MCPJam/inspector`](https://github.com/MCPJam/inspector) separates CLI, evaluators, UI, SDK, examples, and reusable test fixtures in a workspace-oriented repository.
- [`mcpg-dev/mcpg-inspector`](https://github.com/mcpg-dev/mcpg-inspector) isolates an inspection engine from API and UI layers.
- [`hauju/mcpi`](https://github.com/hauju/mcpi) demonstrates small focused modules for probing, mock servers, schema diffing, and storage.

MCP Flightdeck keeps the modularity and fixture-first approach while deliberately omitting a Web app, SaaS backend, OAuth laboratory, and client-matrix evaluator from its first milestone.

## Non-goals for the first milestone

- hosted observability or always-on monitoring;
- full OAuth conformance testing;
- AI-generated test scenarios;
- cross-client emulation matrix;
- collaboration, accounts, or billing;
- a generic MCP Inspector replacement.
