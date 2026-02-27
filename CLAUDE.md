# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development

```bash
pnpm install             # Install dependencies
pnpm run typecheck       # Type-check only (uses tsconfig.json, no emit)
pnpm run format          # Fix formatting
pnpm run format:check    # Check formatting without fixing
pnpm test                # Run all tests (vitest)
pnpm test:watch          # Watch mode
pnpm test:coverage       # Coverage report
pnpm test test/prepare-prompt.test.ts  # Run a single test file
```

### Build

```bash
pnpm run dev             # Fast build + validate (skips tests/lint) — use during iteration
pnpm run build           # Full build: clean → lint → typecheck → test → compile → validate
pnpm run build:fast      # Build without tests/lint
pnpm run build:azure     # TypeScript compile only (tsconfig.build.json → dist/)
pnpm run validate:build  # Validate dist output after build
```

The build compiles TypeScript via `tsconfig.build.json` → `dist/`, then installs `azure-pipelines-task-lib` as a production dependency inside `dist/`. The `task.json` is also copied to `dist/`. The `azure-pipeline.js` entry point in `dist/` is what Azure DevOps executes (`Node22_1` runtime).

### Local task testing

```bash
ANTHROPIC_API_KEY=... node test-azure-task.js    # Run the Azure task locally
node validate-azure-task.js                       # Validate task configuration
```

### Versioning

Versions must stay consistent across **three** files: `package.json`, `vss-extension.json`, and `task.json`. The build script enforces this. Use the bump script to update all at once:

```bash
./scripts/bump-version.sh patch --auto-azure     # Bump patch version across all three files
./scripts/bump-version.sh minor --auto-azure --dry-run
```

### Publishing

```bash
pnpm run create:vsix        # Build + package as .vsix
pnpm run publish:extension  # Publish to Azure DevOps Marketplace
pnpm run publish:dry-run    # Dry-run publish
```

## Architecture

This is an Azure DevOps extension that runs Claude Code inside Azure pipelines. The task definition is in `task.json`; the extension manifest is in `vss-extension.json`.

### Execution flow

```
azure-pipeline.ts        ← AzDo task entry point (Node22_1)
  → azure-setup.ts       ← Sets RUNNER_TEMP/CLAUDE_WORKING_DIR; installs claude CLI if absent
  → setup-claude-code-settings.ts ← Merges enableAllProjectMcpServers into ~/.claude/settings.json
  → azure-validate-env.ts← Reads task inputs, delegates to validate-env-core.ts
  → prepare-prompt.ts    ← Validates/writes prompt to temp file (os.tmpdir()-based paths)
  → azure-run-claude.ts  ← Thin AzDo adapter: builds extraEnv from task inputs, calls runClaude()
      → run-claude.ts    ← Shared execution core: spawns claude, streams output, returns RunResult
```

### Module structure

`src/run-claude.ts` is the **shared execution core**. It accepts all configuration as explicit parameters (`ClaudeOptions` for user-facing options, `RuntimeOptions` for `extraEnv` and `tmpDir`). No Azure DevOps imports.

`src/azure-run-claude.ts` is a **thin AzDo adapter**: reads provider credentials from `tl.*`, builds an `extraEnv` record, calls `runClaude()`, then translates `RunResult` into `tl.setVariable` / `tl.setResult`.

`src/validate-env-core.ts` contains **shared validation logic** for all three providers. Both `validate-env.ts` (reads `process.env`) and `azure-validate-env.ts` (reads `tl.*`) build a `ValidationConfig` object and delegate to `validateConfig()`.

### Prompt delivery via named pipe

The claude process reads stdin from a named FIFO (`claude_prompt_pipe`). Three processes are co-ordinated:

1. `cat <prompt-file>` → pipe write end
2. `cat <pipe>` → claude stdin
3. `claude -p --verbose --output-format stream-json` → stdout

This avoids passing the prompt as a command-line argument.

### Output variables

The task sets two AzDo output variables:

- `conclusion` — `"success"` or `"failure"`
- `execution_file` — path to `claude-execution-output.json` (NDJSON output aggregated into a JSON array using pure Node.js — no `jq` dependency)

### Provider authentication

Authentication is selected by task inputs:

| Provider            | Inputs required                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Anthropic (default) | `anthropic_api_key` OR `claude_code_oauth_token`                                                  |
| AWS Bedrock         | `use_bedrock: true`, `aws_region`, pipeline vars `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`    |
| Google Vertex AI    | `use_vertex: true`, `gcp_project_id`, `gcp_region`, pipeline var `GOOGLE_APPLICATION_CREDENTIALS` |

`use_bedrock` and `use_vertex` are mutually exclusive.

### `claude_env` format

Custom environment variables are passed as `KEY: VALUE` per line (colon-separated, **not** `KEY=VALUE`). Empty lines and `#` comment lines are ignored.

### TypeScript configuration

`tsconfig.json` — type-checking only (`noEmit: true`), Bun bundler mode, used by `pnpm run typecheck` and editors.

`tsconfig.build.json` — emits CommonJS to `dist/`, used by the build pipeline.
