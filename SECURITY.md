# Security Policy

## Supported versions

MCP Flightdeck is pre-release software. Security fixes are applied to the latest commit on `main` until a versioned release policy is published.

## Reporting a vulnerability

Please do **not** report security vulnerabilities through public issues, pull requests, or discussions.

Use GitHub's private vulnerability reporting feature for this repository:

<https://github.com/mariechristsagbo/mcp-flightdeck/security/advisories/new>

Include, where possible:

- a clear description of the vulnerability;
- affected files, commands, or MCP transport paths;
- reproducible steps or a minimal proof of concept;
- impact assessment;
- suggested remediation, if available.

Never include production credentials, bearer tokens, cookies, customer data, or unredacted traces in a report.

## Scope priorities

The project handles MCP configuration and protocol traces. Reports involving secret redaction, unsafe trace persistence, command execution, SSRF, authorization handling, malicious server responses, dependency compromise, or CI artifact exposure are especially important.

## Disclosure

Please allow maintainers reasonable time to investigate and prepare a fix before public disclosure. We will acknowledge a valid report, assess impact, and coordinate disclosure through the GitHub advisory when possible.
