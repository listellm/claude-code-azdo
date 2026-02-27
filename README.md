# Claude Code AzDO Task

> **Origin**: This project was originally forked from [wen-templari/claude-code-base-azure-pipeline-task](https://github.com/wen-templari/claude-code-base-azure-pipeline-task). As the upstream repository was no longer being maintained, this fork has been detached and is now developed independently.
>
> This is still a work in progress. Most of the code was written by claude code and I have only tested the very basic functionalities (Tested using `claude_code_oauth_token` to authenticate and without mcp). Please do not use this extension in production yet.

An Azure DevOps extension that runs [Claude Code](https://www.anthropic.com/claude-code) inside your pipelines for automated code analysis, review, triage, and development tasks.

## Features

- **Multi-provider**: Anthropic API, AWS Bedrock, Google Vertex AI
- **Flexible prompts**: Inline prompt or prompt file
- **Tool control**: Configurable allowed/disallowed tools
- **MCP support**: Pass an MCP config file for external integrations
- **Custom environment**: Inject environment variables into Claude's execution
- **Output variables**: `conclusion` and `execution_file` for downstream steps

## Installation

**From the Marketplace**: Install from the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/items?itemName=claswen.claude-code-base-task).

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

See `azure-pipelines.yml` for complete examples covering all providers and use cases.

## Task Inputs

| Input | Type | Description |
|---|---|---|
| `prompt` | multiLine | Inline prompt (mutually exclusive with `prompt_file`) |
| `prompt_file` | filePath | Path to a prompt file (mutually exclusive with `prompt`) |
| `allowed_tools` | string | Comma-separated list of allowed tools |
| `disallowed_tools` | string | Comma-separated list of disallowed tools |
| `max_turns` | string | Maximum conversation turns |
| `mcp_config` | string | Path to an MCP config JSON file |
| `system_prompt` | multiLine | Override the system prompt |
| `append_system_prompt` | multiLine | Append to the system prompt |
| `model` | string | Model identifier (provider-specific format) |
| `fallback_model` | string | Fallback model when the primary is unavailable |
| `claude_env` | multiLine | Custom environment variables (`KEY: VALUE` per line) |
| `timeout_minutes` | string | Execution timeout in minutes (default: 10) |
| `anthropic_api_key` | string | Anthropic API key |
| `claude_code_oauth_token` | string | Claude Code OAuth token |
| `use_bedrock` | boolean | Use AWS Bedrock |
| `use_vertex` | boolean | Use Google Vertex AI |
| `aws_region` | string | AWS region for Bedrock |
| `gcp_project_id` | string | GCP project ID for Vertex AI |
| `gcp_region` | string | GCP region for Vertex AI |

## Task Outputs

| Output | Description |
|---|---|
| `conclusion` | `success` or `failure` |
| `execution_file` | Path to the NDJSON execution log (JSON array) |

## Authentication

### Anthropic (default)

```yaml
inputs:
  anthropic_api_key: "$(ANTHROPIC_API_KEY)"
  # or
  claude_code_oauth_token: "$(CLAUDE_CODE_OAUTH_TOKEN)"
```

### AWS Bedrock

Set pipeline variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, then:

```yaml
inputs:
  use_bedrock: true
  aws_region: "us-west-2"
  model: "anthropic.claude-3-7-sonnet-20250219-v1:0"
```

### Google Vertex AI

Set pipeline variable `GOOGLE_APPLICATION_CREDENTIALS`, then:

```yaml
inputs:
  use_vertex: true
  gcp_project_id: "my-gcp-project"
  gcp_region: "us-central1"
  model: "claude-3-7-sonnet@20250219"
```

`use_bedrock` and `use_vertex` are mutually exclusive.

## Custom Environment Variables

The `claude_env` input accepts `KEY: VALUE` pairs (one per line). Empty lines and `#` comments are ignored. Azure DevOps variables are expanded.

```yaml
inputs:
  claude_env: |
    ENVIRONMENT: staging
    API_BASE_URL: https://api-staging.example.com
    # This line is ignored
    DATABASE_URL: $(staging-db-url)
```

## MCP Integration

Write an MCP config file in a prior step and pass its path via `mcp_config`:

```yaml
- script: |
    mkdir -p $(Agent.TempDirectory)/mcp
    cat > $(Agent.TempDirectory)/mcp/config.json << 'EOF'
    {
      "mcpServers": {
        "github": {
          "command": "docker",
          "args": ["run", "-i", "--rm", "-e", "GITHUB_TOKEN",
                   "ghcr.io/github/github-mcp-server:latest"],
          "env": { "GITHUB_TOKEN": "$(System.AccessToken)" }
        }
      }
    }
    EOF
  displayName: "Write MCP config"

- task: ClaudeCodeBaseTask@1
  inputs:
    prompt: "Analyse recent GitHub issues."
    mcp_config: "$(Agent.TempDirectory)/mcp/config.json"
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
```

## Development

**Prerequisites**: Node.js ≥ 22, pnpm

```bash
pnpm install          # Install dependencies
pnpm run typecheck    # Type-check (no emit)
pnpm run format       # Fix formatting
pnpm test             # Run tests (vitest)
pnpm run dev          # Fast build + validate
pnpm run build        # Full build: lint → typecheck → test → compile → validate
```

### Versioning

Versions must stay consistent across `package.json`, `vss-extension.json`, and `task.json`. Use the bump script:

```bash
./scripts/bump-version.sh patch --auto-azure       # Bump patch across all three
./scripts/bump-version.sh minor --auto-azure --dry-run
```

### Release

```bash
pnpm run create:vsix        # Build and package as .vsix
pnpm run publish:extension  # Publish to Azure DevOps Marketplace
pnpm run publish:dry-run    # Dry-run publish
```

## Contributing

1. Fork [this repository](https://github.com/listellm/claude-code-azdo)
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## Licence

MIT — see the `LICENSE` file for details.
