# Security Policy

## Supported Versions

Only the latest published version of each package receives security fixes.

## Reporting a Vulnerability

Agentrail runs user-provided code inside Docker sandboxes, manages LLM provider API keys, and exposes network services. Please treat security issues with the appropriate care.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, use one of the following private channels:

- **GitHub Private Security Advisory** (preferred): open a draft advisory at  
  `https://github.com/yai-dev/agentrail/security/advisories/new`
- **Email**: send details to the maintainers via the contact listed on the GitHub organization profile.

### What to include

A useful report includes:

- A description of the vulnerability and the affected package(s)
- Steps to reproduce or a proof-of-concept
- The potential impact (data exposure, sandbox escape, credential leak, etc.)
- Any suggested fix, if you have one

### Response timeline

| Action                                 | Target                                   |
| -------------------------------------- | ---------------------------------------- |
| Acknowledge receipt                    | 48 hours                                 |
| Initial triage and severity assessment | 5 business days                          |
| Fix or mitigation released             | 14 days for critical, 30 days for others |

We will credit reporters in the release notes unless you prefer to remain anonymous.

## Scope

Issues of particular concern given the nature of this framework:

- Sandbox escape from the Docker execution environment
- Unauthorized access to the host filesystem via sandbox tools
- API key exposure through logs, session files, or network responses
- Authentication bypass in the host layer
- Dependency vulnerabilities in published packages (`@agentrail/*`)
