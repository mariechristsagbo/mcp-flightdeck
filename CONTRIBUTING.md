# Contributing to MCP Flightdeck

Thank you for helping make MCP servers safer and more reliable.

## Before you start

- Search existing issues before opening a new one.
- Use an issue to discuss substantial changes before implementation.
- Keep pull requests focused on one user-visible behavior or one maintenance concern.
- Never include credentials, access tokens, cookies, private endpoints, or unredacted MCP traces in an issue, commit, or pull request.

Security vulnerabilities must be reported privately. Read [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Development status

MCP Flightdeck is in its repository-foundation phase. The first implementation milestone is a CLI-first path:

```text
connect → inspect → record → replay
```

The project will publish its supported Node.js version, package manager, local setup steps, and verification commands when the executable foundation lands. Until then, documentation and repository-process contributions are welcome.

## Contribution workflow

1. Open or select an issue describing the problem and expected behavior.
2. Create a branch from `main`.
3. Implement one focused change.
4. Write the failing test first for every behavior change.
5. Run the relevant checks before opening a pull request.
6. Open a pull request that links the issue and explains the behavior and verification.

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/).

```text
feat(recorder): persist redacted protocol events
fix(workflow): reject unresolved step references
docs: clarify local trace storage
chore(ci): add typecheck workflow
```

Commits must be atomic:

- one commit represents one precise change;
- avoid mixing refactors, formatting, documentation, and behavior changes without a necessary relationship;
- keep generated files out of unrelated commits;
- include tests in the same commit as the behavior they specify.

## Testing expectations

MCP protocol behavior is easy to misrepresent with mocks. Prefer controlled MCP fixture servers and test the real transport boundary whenever practical.

For a new behavior, follow a red-green-refactor cycle:

1. Write one focused test for the expected behavior.
2. Run it and verify that it fails for the expected reason.
3. Implement the smallest change that passes it.
4. Run the focused test and the relevant suite.
5. Refactor only while tests remain green.

Tests should verify observable behavior rather than internal implementation details.

## Pull request checklist

Before requesting review, confirm that:

- [ ] The pull request addresses a single issue or purpose.
- [ ] Commits use Conventional Commits and remain atomic.
- [ ] New behavior is covered by tests written before implementation.
- [ ] Relevant local checks pass.
- [ ] Documentation is updated when public behavior or file formats change.
- [ ] Trace examples are redacted and safe to publish.
- [ ] No secrets or private customer data are included.

## Code of conduct

Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).
