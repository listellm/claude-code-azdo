# Claude Code AzDO Task

An Azure DevOps extension that runs [Claude Code](https://www.anthropic.com/claude-code) inside your pipelines for automated code analysis, review, triage, and development tasks.

## Features

- **Multi-provider**: Anthropic API, AWS Bedrock, Google Vertex AI
- **Flexible prompts**: Inline prompt or prompt file
- **Tool control**: Configurable allowed/disallowed tools
- **MCP support**: Pass an MCP config file for external integrations
- **Custom environment**: Inject environment variables into Claude's execution
- **Output variables**: `conclusion` and `execution_file` for downstream steps

## Installation

**From the Marketplace**: Install from the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/items?itemName=listellm.claude-code-base-task).

**From source**:

```bash
pnpm install
pnpm run build
pnpm run create:vsix
# Upload the generated .vsix to your Azure DevOps organisation
```

## Quick Start

```yaml
- task: ClaudeCodeBaseTask@1
  displayName: "Run Claude Code"
  inputs:
    prompt: "Review this codebase and suggest improvements."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
    timeout_minutes: "10"
```

See [`azure-pipelines.yaml`](./azure-pipelines.yaml) for complete examples covering all providers and use cases.

## Task Inputs

| Input                     | Type      | Description                                              |
| ------------------------- | --------- | -------------------------------------------------------- |
| `prompt`                  | multiLine | Inline prompt (mutually exclusive with `prompt_file`)    |
| `prompt_file`             | string    | Path to a prompt file (mutually exclusive with `prompt`) |
| `allowed_tools`           | string    | Comma-separated list of tools Claude may use             |
| `disallowed_tools`        | string    | Comma-separated list of tools Claude may not use         |
| `max_turns`               | string    | Maximum conversation turns (default: no limit)           |
| `mcp_config`              | string    | Path to an MCP config JSON file                          |
| `system_prompt`           | multiLine | Override the system prompt                               |
| `append_system_prompt`    | multiLine | Append to the default system prompt                      |
| `model`                   | string    | Model identifier (provider-specific format)              |
| `fallback_model`          | string    | Fallback model when the primary is unavailable           |
| `claude_env`              | multiLine | Custom environment variables (`KEY: VALUE` per line)     |
| `timeout_minutes`         | string    | Execution timeout in minutes (default: `10`)             |
| `anthropic_api_key`       | string    | Anthropic API key                                        |
| `claude_code_oauth_token` | string    | Claude Code OAuth token (alternative to API key)         |
| `use_bedrock`             | boolean   | Route requests through AWS Bedrock                       |
| `use_vertex`              | boolean   | Route requests through Google Vertex AI                  |
| `aws_region`              | string    | AWS region (required when `use_bedrock: true`)           |
| `gcp_project_id`          | string    | GCP project ID (required when `use_vertex: true`)        |
| `gcp_region`              | string    | GCP region (required when `use_vertex: true`)            |

`use_bedrock` and `use_vertex` are mutually exclusive.

## Task Outputs

| Output           | Description                                   |
| ---------------- | --------------------------------------------- |
| `conclusion`     | `success` or `failure`                        |
| `execution_file` | Path to the NDJSON execution log (JSON array) |

## Authentication

### Anthropic API (default)

```yaml
- task: ClaudeCodeBaseTask@1
  inputs:
    prompt: "..."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
```

Store the key as a secret pipeline variable or in Azure Key Vault.

### OAuth token

```yaml
- task: ClaudeCodeBaseTask@1
  inputs:
    prompt: "..."
    claude_code_oauth_token: "$(CLAUDE_CODE_OAUTH_TOKEN)"
```

### AWS Bedrock

```yaml
variables:
  AWS_ACCESS_KEY_ID: $(aws-access-key-id)
  AWS_SECRET_ACCESS_KEY: $(aws-secret-access-key)

steps:
  - task: ClaudeCodeBaseTask@1
    inputs:
      prompt: "..."
      use_bedrock: true
      aws_region: "us-east-1"
      model: "anthropic.claude-3-7-sonnet-20250219-v1:0"
```

### Google Vertex AI

```yaml
variables:
  GOOGLE_APPLICATION_CREDENTIALS: $(google-application-credentials)

steps:
  - task: ClaudeCodeBaseTask@1
    inputs:
      prompt: "..."
      use_vertex: true
      gcp_project_id: "my-gcp-project"
      gcp_region: "us-central1"
      model: "claude-3-7-sonnet@20250219"
```

## Custom Environment Variables

Pass extra environment variables to Claude's execution context using `KEY: VALUE` syntax
(one per line, colon-separated — not `KEY=VALUE`):

```yaml
- task: ClaudeCodeBaseTask@1
  inputs:
    prompt: "..."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
    claude_env: |
      MY_VAR: some_value
      ANOTHER_VAR: another_value
      # Comments are ignored
```

## Using Output Variables

```yaml
- task: ClaudeCodeBaseTask@1
  name: claudeTask
  inputs:
    prompt: "..."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"

- script: |
    echo "Conclusion: $(claudeTask.conclusion)"
    echo "Execution log: $(claudeTask.execution_file)"
  displayName: "Check Claude output"
```

## Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run tests
pnpm run build        # Full build (lint → typecheck → test → compile → validate)
pnpm run dev          # Fast build without tests/lint
```

Requires Node.js >=22.

### Versioning

Versions must stay consistent across `package.json`, `vss-extension.json`, and `task.json`:

```bash
./scripts/bump-version.sh patch --auto-azure
./scripts/bump-version.sh minor --auto-azure --dry-run
```

### Publishing

```bash
pnpm run create:vsix                                          # Build and package
AZURE_DEVOPS_EXT_PAT=<pat> ./scripts/publish-azure-extension.sh --dry-run
AZURE_DEVOPS_EXT_PAT=<pat> ./scripts/publish-azure-extension.sh
```
