# Claude Code AzDO Task

An Azure DevOps extension that runs [Claude Code](https://www.anthropic.com/claude-code) inside your pipelines for automated code analysis, review, triage, and development tasks.

## Features

- **Multi-provider**: Anthropic API, AWS Bedrock, Google Vertex AI
- **Flexible prompts**: Inline prompt or prompt file
- **Tool control**: Configurable allowed/disallowed tools
- **MCP support**: Pass an MCP config file for external integrations
- **Custom environment**: Inject environment variables into Claude's execution
- **Output variables**: `conclusion` and `execution_file` for downstream steps
- **PR review comments**: Posts issues as inline PR threads with severity filtering
- **Noise suppression**: Accept issues per-file via `/accept` reply, or permanently via `claude-ignore` inline markers

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
- task: ClaudeCodeBaseTask@2
  displayName: "Run Claude Code"
  inputs:
    prompt: "Review this codebase and suggest improvements."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
    timeout_minutes: "10"
```

See [`azure-pipelines.yaml`](./azure-pipelines.yaml) for complete examples covering all providers and use cases.

## Task Inputs

| Input                     | Type      | Default           | Description                                                             |
| ------------------------- | --------- | ----------------- | ----------------------------------------------------------------------- |
| `prompt`                  | multiLine |                   | Inline prompt (mutually exclusive with `prompt_file`)                   |
| `prompt_file`             | string    |                   | Path to a prompt file (mutually exclusive with `prompt`)                |
| `allowed_tools`           | string    | see below         | Comma-separated list of tools Claude may use                            |
| `disallowed_tools`        | string    |                   | Comma-separated list of tools Claude may not use                        |
| `max_turns`               | string    |                   | Maximum conversation turns (default: no limit)                          |
| `mcp_config`              | string    |                   | Path to an MCP config JSON file                                         |
| `system_prompt`           | multiLine |                   | Override the system prompt                                              |
| `append_system_prompt`    | multiLine |                   | Append to the default system prompt                                     |
| `reviewer_terraform`      | boolean   | `false`           | Inject Terraform review standards; reads modified `.tf`/`.tfvars` files |
| `reviewer_yaml`           | boolean   | `false`           | Inject YAML/Kubernetes review standards; reads modified `.yaml` files   |
| `model`                   | string    | see below         | Model identifier (provider-specific format)                             |
| `fallback_model`          | string    |                   | Fallback model when the primary is unavailable                          |
| `claude_env`              | multiLine |                   | Custom environment variables (`KEY: VALUE` per line)                    |
| `timeout_minutes`         | string    | `10`              | Execution timeout in minutes                                            |
| `install_claude_cli`      | boolean   | `true`            | Install Claude CLI if absent; set to `false` when pre-installed         |
| `use_node_cache`          | boolean   | `false`           | Cache Node.js dependencies (only for Node.js projects with lock files)  |
| `post_pr_comments`        | boolean   | `true`            | Post issues as inline PR threads; requires `System.AccessToken`         |
| `minimum_severity`        | pickList  | `WARNING`         | Minimum severity to post: `CRITICAL`, `WARNING`, or `SUGGESTION`        |
| `anthropic_api_key`       | string    |                   | Anthropic API key                                                       |
| `claude_code_oauth_token` | string    |                   | Claude Code OAuth token (alternative to API key)                        |
| `use_bedrock`             | boolean   | `false`           | Route requests through AWS Bedrock                                      |
| `use_vertex`              | boolean   | `false`           | Route requests through Google Vertex AI                                 |
| `aws_region`              | string    |                   | AWS region (required when `use_bedrock: true`)                          |
| `gcp_project_id`          | string    |                   | GCP project ID (required when `use_vertex: true`)                       |
| `gcp_region`              | string    |                   | GCP region (required when `use_vertex: true`)                           |
| `s3_state_bucket`         | string    |                   | S3 bucket for PR review state caching (opt-in; leave empty to disable)  |
| `s3_state_prefix`         | string    | `claude-pr-state` | S3 key prefix for state objects                                         |

`use_bedrock` and `use_vertex` are mutually exclusive.

## PR Review Comments

When `post_pr_comments: true` (the default), the task posts issues Claude finds as inline PR thread comments after execution. This requires `System.AccessToken` to be available in the pipeline.

Severity filtering is controlled by `minimum_severity` (`CRITICAL > WARNING > SUGGESTION`). The default `WARNING` suppresses suggestions, which tend to be noisy on busy repos. Set to `SUGGESTION` to see everything, or `CRITICAL` to see blocking issues only.

```yaml
- task: ClaudeCodeBaseTask@2
  inputs:
    reviewer_terraform: true
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
    post_pr_comments: true
    minimum_severity: "WARNING" # default — omit to use the same value
  env:
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

### Comment format

Each thread Claude posts is clearly attributed and includes inline suppression instructions:

```
🤖 **Claude Code CI Review** | [WARNING]

Password stored in plaintext — use a secrets manager or environment variable.

---
💡 Reply `/accept` to suppress all issues on this file in future runs · add `# claude-ignore`
   (or language equivalent) to the line to suppress permanently.
```

General threads (not tied to a specific file) show only the `/accept` option.

### Accepting issues via `/accept`

Reply `/accept` to any thread Claude has posted. On the next pipeline run, all new issues
on that file will be skipped.

> **Matching is file-path based.** One `/accept` reply on any thread for `modules/vpc/main.tf`
> suppresses _all_ new issues on that file in future runs. The reply can be on any comment in
> the thread — root or reply — and is matched case-insensitively.

### Suppressing issues permanently with `claude-ignore`

Add a `claude-ignore` annotation in a code comment on the offending line. Claude will not
emit an issue for any line carrying this marker regardless of run.

```hcl
# claude-ignore
password = var.db_password  # accepted — rotated via Vault
```

```python
# claude-ignore
secret = os.getenv("MY_SECRET")  # not a secret — public config value
```

```typescript
// claude-ignore
const endpoint = "http://internal-service"; // internal only, not public
```

```yaml
# claude-ignore
image: my-registry/app:latest # tag pinning handled by renovate
```

This is version-controlled and permanent. Use it when you have consciously accepted a finding
and want it suppressed for all future runs without relying on thread state.

## S3 State Caching

When `s3_state_bucket` is set, the task persists per-PR review state to S3 so that re-runs on subsequent commits can skip unchanged files and suppress already-posted issues.

```yaml
- task: ClaudeCodeBaseTask@2
  inputs:
    reviewer_terraform: true
    use_bedrock: true
    aws_region: "eu-central-1"
    model: "eu.anthropic.claude-sonnet-4-6-20251001-v1:0"
    post_pr_comments: true
    s3_state_bucket: "my-claude-state-bucket"
    # s3_state_prefix: "claude-pr-state"  # optional, this is the default
```

### How it works

State is stored at `s3://{bucket}/{prefix}/{repoId}/{prId}/state.json` and includes:

- **Content hashes** for each changed file — re-review only the files that actually changed
- **Posted fingerprints** — deduplicate issues already raised in a previous run so the PR is not flooded with duplicate threads

On each run the task:

1. Reads state from S3
2. Computes which files changed since the last run (by comparing content hashes)
3. Injects a context preamble telling Claude to focus on the changed files
4. After Claude finishes, writes updated state back to S3

### Cache invalidation

| Trigger                        | Effect                         |
| ------------------------------ | ------------------------------ |
| File content changes           | File is dirty; re-reviewed     |
| Model ID changes               | Full cache bust                |
| `append_system_prompt` changes | Full cache bust                |
| New PR / different PR          | Different S3 key — fresh state |

### AWS permissions

The IAM role used by the pipeline needs `s3:GetObject` and `s3:PutObject` on the state bucket:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::my-claude-state-bucket/claude-pr-state/*"
}
```

When using Bedrock with IRSA, the same pod identity covers both Bedrock and S3 provided the role has the S3 actions above.

S3 read/write failures are non-fatal — the task logs a warning and continues with all files treated as dirty.

## Task Outputs

| Output           | Description                                   |
| ---------------- | --------------------------------------------- |
| `conclusion`     | `success` or `failure`                        |
| `execution_file` | Path to the NDJSON execution log (JSON array) |

## Authentication

### Anthropic API (default)

```yaml
- task: ClaudeCodeBaseTask@2
  inputs:
    prompt: "..."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
```

Store the key as a secret pipeline variable or in Azure Key Vault.

### OAuth token

```yaml
- task: ClaudeCodeBaseTask@2
  inputs:
    prompt: "..."
    claude_code_oauth_token: "$(CLAUDE_CODE_OAUTH_TOKEN)"
```

### AWS Bedrock

**IRSA / Pod Identity (preferred)** — when the agent pod is annotated with an IAM role,
the AWS SDK credential chain resolves credentials automatically. No static keys needed:

```yaml
steps:
  - task: ClaudeCodeBaseTask@2
    inputs:
      prompt: "..."
      use_bedrock: true
      aws_region: "us-east-1"
      model: "us.anthropic.claude-sonnet-4-5-20251001-v1:0"
```

See [`examples/pr-review-bedrock-irsa.yaml`](./examples/pr-review-bedrock-irsa.yaml) for
the full Kubernetes service account annotation and IAM trust policy setup.

**Static keys (fallback)** — if you are not using IRSA or Pod Identity, pass credentials
via pipeline variables. Both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must be set
together:

```yaml
variables:
  AWS_ACCESS_KEY_ID: $(aws-access-key-id)
  AWS_SECRET_ACCESS_KEY: $(aws-secret-access-key)

steps:
  - task: ClaudeCodeBaseTask@2
    inputs:
      prompt: "..."
      use_bedrock: true
      aws_region: "us-east-1"
      model: "anthropic.claude-3-7-sonnet-20250219-v1:0"
```

See [`examples/iam/bedrock-permissions.json`](./examples/iam/bedrock-permissions.json) for
the required IAM permissions policy.

### Google Vertex AI

```yaml
variables:
  GOOGLE_APPLICATION_CREDENTIALS: $(google-application-credentials)

steps:
  - task: ClaudeCodeBaseTask@2
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
- task: ClaudeCodeBaseTask@2
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
- task: ClaudeCodeBaseTask@2
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
