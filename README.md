# Claude Code AzDO Task

[![CI](https://github.com/listellm/claude-code-azdo/actions/workflows/ci.yaml/badge.svg)](https://github.com/listellm/claude-code-azdo/actions/workflows/ci.yaml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/listellm.claude-code-base-task?label=Marketplace&logo=azure-devops)](https://marketplace.visualstudio.com/items?itemName=listellm.claude-code-base-task)
[![License: MIT](https://img.shields.io/github/license/listellm/claude-code-azdo)](./LICENSE)

An Azure DevOps extension that runs [Claude Code](https://www.anthropic.com/claude-code) inside your pipelines for automated code analysis, review, triage, and development tasks.

> **Fork notice**: This project is a fork of [wen-templari/claude-code-base-azure-pipeline-task](https://github.com/wen-templari/claude-code-base-azure-pipeline-task).

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
- task: ClaudeCodeBaseTask@3
  displayName: "Run Claude Code"
  inputs:
    prompt: "Review this codebase and suggest improvements."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
    timeout_minutes: "10"
```

See [`azure-pipelines.yaml`](./azure-pipelines.yaml) for complete examples covering all providers and use cases.

## Task Inputs

| Input                        | Type      | Default           | Description                                                                               |
| ---------------------------- | --------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `prompt`                     | multiLine |                   | Inline prompt (mutually exclusive with `prompt_file`)                                     |
| `prompt_file`                | string    |                   | Path to a prompt file (mutually exclusive with `prompt`)                                  |
| `context_dir`                | string    |                   | Directory of reference files injected into the system prompt (50 KB cap, non-recursive)   |
| `allowed_tools`              | string    | see below         | Comma-separated list of tools Claude may use                                              |
| `disallowed_tools`           | string    |                   | Comma-separated list of tools Claude may not use                                          |
| `max_turns`                  | string    |                   | Maximum conversation turns (default: no limit)                                            |
| `mcp_config`                 | string    |                   | Path to an MCP config JSON file                                                           |
| `system_prompt`              | multiLine |                   | Override the system prompt                                                                |
| `append_system_prompt`       | multiLine |                   | Append to the default system prompt                                                       |
| `reviewer_terraform`         | boolean   | `false`           | Inject Terraform review standards for `.tf`/`.tfvars` files                               |
| `reviewer_yaml`              | boolean   | `false`           | Inject YAML/Kubernetes review standards for `.yaml`/`.yml` files                          |
| `reviewer_helm`              | boolean   | `false`           | Inject Helm chart review standards for chart files                                        |
| `reviewer_cilium`            | boolean   | `false`           | Inject Cilium network policy review standards for CNP files                               |
| `reviewer_dockerfile`        | boolean   | `false`           | Inject Dockerfile review standards                                                        |
| `reviewer_dotnet_core`       | boolean   | `false`           | Inject .NET Core review standards for `.cs`/`.csproj` files                               |
| `reviewer_golang`            | boolean   | `false`           | Inject Go review standards for `.go` files                                                |
| `reviewer_java`              | boolean   | `false`           | Inject Java review standards for `.java` files                                            |
| `reviewer_javascript`        | boolean   | `false`           | Inject JavaScript review standards for `.js`/`.mjs`/`.cjs` files                          |
| `reviewer_nextjs`            | boolean   | `false`           | Inject Next.js review standards for `.tsx`/`.ts` files                                    |
| `reviewer_php`               | boolean   | `false`           | Inject PHP review standards for `.php` files                                              |
| `reviewer_powershell_core`   | boolean   | `false`           | Inject PowerShell review standards for `.ps1`/`.psm1`/`.psd1` files                       |
| `reviewer_python`            | boolean   | `false`           | Inject Python review standards for `.py` files                                            |
| `reviewer_rust`              | boolean   | `false`           | Inject Rust review standards for `.rs` files                                              |
| `reviewer_sql`               | boolean   | `false`           | Inject SQL review standards for `.sql` files                                              |
| `reviewer_typescript`        | boolean   | `false`           | Inject TypeScript review standards for `.ts`/`.tsx` files                                 |
| `model`                      | string    | see below         | Model identifier (provider-specific format)                                               |
| `fallback_model`             | string    |                   | Fallback model when the primary is unavailable                                            |
| `claude_env`                 | multiLine |                   | Custom environment variables (`KEY: VALUE` per line)                                      |
| `timeout_minutes`            | string    | `10`              | Execution timeout in minutes                                                              |
| `install_claude_cli`         | boolean   | `true`            | Install Claude CLI if absent; set to `false` when pre-installed                           |
| `use_node_cache`             | boolean   | `false`           | Cache Node.js dependencies (only for Node.js projects with lock files)                    |
| `post_pr_comments`           | boolean   | `true`            | Post issues as inline PR threads; requires `System.AccessToken`                           |
| `minimum_severity`           | pickList  | `WARNING`         | Minimum severity to post: `CRITICAL`, `WARNING`, or `SUGGESTION`                          |
| `anthropic_api_key`          | string    |                   | Anthropic API key                                                                         |
| `claude_code_oauth_token`    | string    |                   | Claude Code OAuth token (alternative to API key)                                          |
| `use_bedrock`                | boolean   | `false`           | Route requests through AWS Bedrock                                                        |
| `use_vertex`                 | boolean   | `false`           | Route requests through Google Vertex AI                                                   |
| `aws_region`                 | string    |                   | AWS region (required when `use_bedrock: true`)                                            |
| `gcp_project_id`             | string    |                   | GCP project ID (required when `use_vertex: true`)                                         |
| `gcp_region`                 | string    |                   | GCP region (required when `use_vertex: true`)                                             |
| `s3_state_bucket`            | string    |                   | S3 bucket for PR review state caching (opt-in; leave empty to disable)                    |
| `s3_state_prefix`            | string    | `claude-pr-state` | S3 key prefix for state objects                                                           |
| `pr_review_token`            | string    |                   | PAT for posting PR comments and reviewer votes (see PR Review Comments)                   |
| `reply_classification_model` | string    |                   | Model for classifying PR thread replies; defaults to the review model                     |
| `approve_pr_on_no_issues`    | boolean   | `false`           | Approve the PR when no new issues found; set to waiting-for-author when issues are posted |

`use_bedrock` and `use_vertex` are mutually exclusive.

## Built-in Reviewers

Each `reviewer_*` toggle injects a domain-specific checklist into the system prompt. Claude uses these standards when reviewing the PR diff. Enable multiple reviewers to cover polyglot repositories — their prompts are concatenated.

### Infrastructure & DevOps

<details>
<summary><code>reviewer_terraform</code> — Naming conventions, dependency style, count logic, security, secrets handling</summary>

**Naming:**

- Resources: kebab-case; variables: `snake_case` with `[provider]_[resource_type]_[parameter_name]` pattern
- Variable blocks ordered: `type`, `description`, `default`; string defaults `null` not `""`
- Tags: PascalCase keys; module names: snake_case

**Dependencies:**

- Implicit dependencies preferred over explicit `depends_on`

**Logic:**

- Count conditionals use affirmative logic (`!local.use_x ? 1 : 0`)
- Dynamic blocks: blank line after opening brace; blank line between `for_each` and `content`

**Quality:**

- No hardcoded values that should be variables; no dead code
- Secrets via `terraform-aws-modules/secrets-manager/aws`, not raw `aws_secretsmanager_secret` resources

**Security:**

- Least-privilege IAM; encryption at rest and in transit; no hardcoded credentials

</details>

<details>
<summary><code>reviewer_yaml</code> — Structure, K8s resource limits/security contexts, image pinning, pipeline secrets</summary>

**Structure:**

- Consistent 2-space indentation; no trailing whitespace; valid YAML syntax

**Secrets:**

- No hardcoded credentials, tokens, or passwords
- Pipeline YAML: secrets from variable groups or key vault references, not inline values

**Kubernetes:**

- All Deployments/StatefulSets/DaemonSets must specify resource requests and limits
- Security contexts: `runAsNonRoot`, `readOnlyRootFilesystem`, drop ALL capabilities
- No `:latest` image tags — use explicit digest or semver tags
- Network policies restrict ingress/egress to least required

**Pipelines:**

- No secrets in plain text; pin task versions; avoid `@latest`

</details>

<details>
<summary><code>reviewer_helm</code> — Chart structure, template correctness (required/with/nindent), values hygiene, registry security</summary>

**Chart structure:**

- `Chart.yaml` must use `apiVersion: v2`; `appVersion` must differ from `version`
- `values.yaml` defaults: safe and minimal — no sensitive data, no cluster-specific values
- `_helpers.tpl` defines namespaced to chart name; common labels helper on all resource metadata

**Template correctness:**

- Mandatory values use `required`; optional nested values use `with` to guard nil dereference
- Multi-line merges: `toYaml | nindent`, not string concatenation
- Whitespace trimming (`{{-` and `-}}`) must be consistent
- `include` over `template` (returns a string, composable with `nindent`)

**Security:**

- Image registry from `values.yaml` — no hardcoded registry URLs in templates
- `imagePullPolicy: Always` only when images are re-tagged on every push; otherwise `IfNotPresent`
- `semverCompare` guards for removed API versions are dead code and should be removed

**Values hygiene:**

- Every `.Values.x` reference must have a corresponding `values.yaml` entry
- Environment override files must only contain values that genuinely differ per environment

</details>

<details>
<summary><code>reviewer_cilium</code> — Selector correctness, egress/ingress rules, default-deny posture, DNS policy</summary>

**Selector correctness:**

- `endpointSelector` `matchLabels` must match labels actually applied to pods — stale selectors silently match nothing
- Cross-namespace `fromEndpoints` rules must include a `namespaceSelector`

**Egress rules:**

- `toFQDNs` entries must include `toPorts` restricting to the minimum required port
- `toEntities: world` flagged — prefer explicit `toFQDNs` with hostnames
- External service egress scoped to exact endpoints, not broad CIDRs

**Ingress rules:**

- `fromEntities: world` requires explicit justification — permits any external source
- Cross-namespace rules must pair with a `namespaceSelector`

**Default-deny posture:**

- Every workload with selective allow rules must have a default-deny baseline (empty `ingress: []` / `egress: []` or `CiliumClusterwideNetworkPolicy` coverage)
- Workloads with no CNP but known external dependencies flagged as missing policy

**DNS policy:**

- Any `toFQDNs` policy must include a separate egress rule permitting UDP 53 and TCP 53 to kube-dns

</details>

<details>
<summary><code>reviewer_dockerfile</code> — Base image pinning, layer ordering, non-root user, multi-stage builds, .dockerignore</summary>

**Base image hygiene:**

- Pinned to digest (`image@sha256:...`) or specific patch version — no floating tags (`:latest`, `:3`)
- Internal registry references — no direct Docker Hub or public registry pulls

**Layer ordering and cache efficiency:**

- Dependency installation before `COPY` of application source
- `RUN` commands chained with `&&` to reduce layer count

**Security:**

- Final `USER` must not be root or UID 0
- `pip install --no-cache-dir`; `apt-get -y --no-install-recommends` with `rm -rf /var/lib/apt/lists/*` in same layer
- No secrets, tokens, or credentials in `ENV`, `ARG`, or `RUN`
- `COPY . .` reviewed for `.dockerignore` coverage

**Multi-stage builds:**

- Build tooling not needed at runtime must use multi-stage builds
- `COPY --from=builder` paths must be explicit — no copying entire directories for a single binary

</details>

### Backend Languages

<details>
<summary><code>reviewer_dotnet_core</code> — Async patterns, DI captive dependencies, IDisposable, nullable, EF Core N+1, structured logging</summary>

**Async patterns:**

- Never `.Result` or `.Wait()` — always `await`
- Async methods return `Task`/`Task<T>`/`ValueTask<T>`, not `void` (except event handlers)
- `ConfigureAwait(false)` in library code; honour sync context in application code

**Dependency injection:**

- Scoped services must not be injected into singletons (captive dependency)
- Transient `IDisposable` registrations flagged
- `HttpClient` via `IHttpClientFactory`, not `new HttpClient()`

**Resource management:**

- All `IDisposable`/`IAsyncDisposable` types in `using`/`await using`
- Deterministic disposal for DB connections, streams, HTTP responses

**Modern C# and nullability:**

- `#nullable enable`; records for immutable DTOs; pattern matching over cascading if/else
- `IOptions<T>` for configuration — no raw `IConfiguration` string lookups

**EF Core:**

- N+1 detection — use `.Include()` or projection; `AsNoTracking()` for read-only queries

**Security:**

- Parameterised SQL; encoded user output; secrets from `IConfiguration`/`IOptions`

**Logging:**

- Structured logging (`ILogger` with message templates) — no string interpolation in log calls

</details>

<details>
<summary><code>reviewer_golang</code> — Error wrapping, goroutine lifetime, defer cleanup, timeouts, structured logging</summary>

**Error handling:**

- Every returned error checked — no ignored returns (including `Close`, `Flush`, `Write`)
- Errors wrapped with `fmt.Errorf("...: %w", err)`; sentinel errors use `errors.Is`/`errors.As`
- No `panic` in library code

**Concurrency:**

- Goroutine lifetime bounded — context cancellation, done channel, or `WaitGroup`
- Shared mutable state protected by mutex or channels
- `context.Context` as first parameter; honour cancellation

**Resource management:**

- `defer` for cleanup immediately after acquisition
- HTTP response bodies: `defer resp.Body.Close()`
- File handles and DB connections closed via `defer`

**Design:**

- Accept interfaces, return structs; exported functions have doc comments
- HTTP clients/servers set explicit timeouts (no `http.DefaultClient` without timeout)
- Prefer `log/slog` over `fmt.Printf`

</details>

<details>
<summary><code>reviewer_java</code> — try-with-resources, Optional null safety, thread safety, PreparedStatement, modern Java (records, sealed, virtual threads)</summary>

**Resource management:**

- All `AutoCloseable` resources in try-with-resources — never manual `close()` in finally
- JDBC connections, statements, result sets all in try-with-resources

**Null safety:**

- `Optional<T>` over null returns; `@Nullable`/`@NonNull` annotations on API boundaries
- No `.get()` on `Optional` without `.isPresent()` — use `.orElse`/`.orElseThrow`

**Thread safety:**

- Mutable shared state synchronised or using concurrent collections
- Check-then-act sequences must be atomic

**Security:**

- `PreparedStatement` with bind parameters — no string concatenation in queries
- Log message sanitisation; restricted deserialisation of untrusted data

**Modern Java:**

- Records for immutable data carriers; sealed classes for closed hierarchies
- Switch expressions and pattern matching (Java 21+); virtual threads for I/O-bound work

**Code quality:**

- No empty catch blocks; specific exception types; no wildcard imports
- `List.of`/`Map.of` for read-only collections; N+1 detection in JPA/Hibernate

</details>

<details>
<summary><code>reviewer_php</code> — strict_types, PSR-12, parameterised SQL, no eval, session security</summary>

**Type safety:**

- `declare(strict_types=1)` in every file
- Type hints on all parameters and returns; enums over string/int constants (PHP 8.1+)
- Constructor property promotion; `readonly` properties/classes (PHP 8.2+)
- `match` expressions over `switch` for value-returning comparisons

**PSR-12:**

- Brace placement, spacing, line length; namespace/use ordering; one class per file

**Security:**

- Parameterised queries via PDO or query builder — no string interpolation
- No `eval()`, no variable variables (`$$var`), no `unserialize()` on untrusted data
- `htmlspecialchars()` with `ENT_QUOTES` for HTML output
- File upload validation (MIME, size, extension); session strict mode and ID regeneration

**Error handling:**

- Specific exception classes — no generic `throw new Exception()`
- No error suppression operator (`@`); PSR-3 logging with context

</details>

<details>
<summary><code>reviewer_python</code> — Type hints, context managers, parameterised SQL, no bare except, dataclasses/Pydantic</summary>

**Type hints:**

- All function signatures typed; modern syntax (`list[str]`, `X | None`) for Python 3.10+
- `TypeVar`/`ParamSpec` for generics; avoid `Any` where narrower types are possible

**Resource management:**

- File handles, DB connections, network sessions via `with`/`async with`
- Temporary files via `tempfile` context managers

**Security:**

- No `eval()`, `exec()`, or `__import__()` on untrusted data
- Parameterised SQL — no f-strings in query text; no `pickle.load()` or `yaml.load()` on untrusted data
- `subprocess` with list arguments, not `shell=True`

**Error handling:**

- No bare `except:` — specific exception types; `raise from` for chaining; `logger.exception()` in except blocks

**Pythonic patterns:**

- PEP 8 naming; comprehensions over manual loops; no mutable default arguments
- `dataclasses` or Pydantic for structured data; `Protocol` for interfaces; generators for large sequences

</details>

<details>
<summary><code>reviewer_rust</code> — Ownership/borrowing, Result error handling, unsafe SAFETY comments, Send+Sync, clippy::pedantic</summary>

**Ownership and borrowing:**

- Unnecessary `.clone()` must be justified; prefer `&T`/`&mut T` over owned `T`
- Lifetime annotations correct and minimal — no annotations the compiler can elide

**Error handling:**

- Library code returns `Result<T, E>` — no `panic!`, `unwrap()`, or `expect()` outside tests
- `thiserror` for library errors, `anyhow` for application error propagation; `?` operator preferred
- `.unwrap()` in non-test code must have a comment explaining infallibility

**Unsafe:**

- Every `unsafe` block requires a `// SAFETY:` comment; prefer safe abstractions
- Unsafe must not bypass borrow checker — fix the design instead

**Concurrency:**

- Types shared across threads implement `Send + Sync` correctly
- No blocking ops inside async functions — use tokio equivalents

**Performance:**

- Iterators over indexed loops; `&str` over `String` in parameters; `Cow<str>` for conditional ownership
- Large stack types boxed; zero-copy patterns where possible
- Code passes `clippy::pedantic` without suppression unless justified

</details>

<details>
<summary><code>reviewer_sql</code> — JOIN correctness, NULL handling, schema design, parameterised queries, migration safety (locking, rollback)</summary>

**Query correctness:**

- JOIN conditions complete — no missing `ON` clauses; `IS NULL`/`IS NOT NULL` (not `= NULL`)
- `GROUP BY` includes all non-aggregate SELECT columns; `UNION ALL` preferred over `UNION`
- CTEs for readability; window functions over self-joins for ranking/aggregates

**Schema design:**

- Primary keys on all tables; foreign key constraints for referential integrity
- Appropriate column types; explicit `NOT NULL` constraints; indexes on WHERE/JOIN/ORDER BY columns

**Security:**

- No dynamic SQL via string concatenation — parameterised queries or `sp_executesql`
- No `SELECT *` in application queries; least-privilege grants

**Migration safety:**

- `ALTER TABLE` on large tables: add column as NULL first, backfill, then add NOT NULL
- `DROP TABLE`/`DROP COLUMN` preceded by verification of no code references
- Index creation: `CONCURRENTLY` (PostgreSQL) or `ONLINE` (MySQL/SQL Server)
- Data migrations must be reversible — rollback script required

</details>

### Frontend & Full-Stack

<details>
<summary><code>reviewer_javascript</code> — const/let, strict equality, async/await, memory leaks, prototype pollution</summary>

**Language patterns:**

- `const` by default, `let` when reassignment needed — never `var`
- Strict equality (`===`) everywhere; optional chaining (`?.`) and nullish coalescing (`??`)
- No `eval()`, `new Function()`, or `document.write()`

**Async patterns:**

- `async`/`await` over raw `.then()` chains; every promise awaited or handled
- Async in `Array.map` → `Promise.all`; async in `forEach` → `for...of`
- `try`/`catch` or `.catch()` — unhandled rejections crash Node.js

**Module structure:**

- Named exports preferred; imports at top of file; no circular dependencies

**Memory and resource management:**

- Event listeners removed when no longer needed (`removeEventListener`/`AbortController`)
- Closures reviewed for unintentional retention; timers cleared on teardown

**Security:**

- No `innerHTML` with user data — use `textContent` or sanitise
- No shell command construction from user input; environment secrets not logged
- Prototype pollution guard — no unvalidated `obj[userKey] = value`

</details>

<details>
<summary><code>reviewer_typescript</code> — No any, type narrowing, discriminated unions, branded types, import type</summary>

**Type safety:**

- No `any` — use `unknown` and narrow with type guards
- No unguarded type assertions (`as X`) — prefer discriminated unions, `instanceof`, `in`
- Non-null assertions (`!`) must have a justification comment; strict mode enabled

**Type design:**

- Exported functions have explicit return types; discriminated unions over boolean flags
- `readonly` for immutable properties/arrays; `interface` for extensible shapes, `type` for unions

**Async patterns:**

- Every promise awaited or handled; `Promise.all` for async `Array.map`
- `try`/`catch` or `.catch()` on awaits

**Type techniques:**

- Branded types for domain identifiers; type predicates (`x is Foo`) in guards
- `import type` for type-only imports; `never` in exhaustive switch default cases

**Code quality:**

- No unused imports/variables/type parameters; `satisfies` operator for config objects
- Const objects with `as const` preferred over enums

</details>

<details>
<summary><code>reviewer_nextjs</code> — Server/Client component boundaries, server actions validation, caching strategy, NEXT_PUBLIC_ prefix</summary>

**App Router:**

- Minimise `"use client"` — keep components as Server Components unless they need hooks/event handlers/browser APIs
- No server-only imports (`fs`, database clients) in Client Components
- `generateMetadata` in Server Components only

**Data fetching:**

- Server-side fetching preferred (async Server Components, server actions)
- Appropriate caching: `force-cache` for static, `{ next: { revalidate: N } }` for ISR
- Avoid waterfall fetches — `Promise.all` for parallel data needs

**Server Actions:**

- All inputs validated (zod or similar); no internal IDs/secrets in hidden form fields
- `useActionState`/`useFormStatus` for loading states, not manual `useState`

**Rendering and streaming:**

- `loading.tsx`/`error.tsx` for route-level boundaries; route groups for layout organisation
- `Suspense` boundaries for large data-dependent pages (TTFB improvement)

**Security and performance:**

- `NEXT_PUBLIC_` prefix only for browser-exposed vars — server secrets must not use it
- `next/image` for all images; `next/dynamic` for heavy below-fold components
- Middleware must not perform expensive operations

</details>

### Scripting

<details>
<summary><code>reviewer_powershell_core</code> — CmdletBinding/ShouldProcess, no aliases, no Invoke-Expression, PSCredential, cross-platform paths</summary>

**Parameter handling:**

- `[CmdletBinding()]` and `param()` blocks on all scripts and functions
- Validation attributes (`[ValidateNotNullOrEmpty()]`, `[ValidateSet()]`, etc.)
- Destructive ops: `[CmdletBinding(SupportsShouldProcess)]` with `$PSCmdlet.ShouldProcess()`
- `[Parameter(Mandatory)]` instead of manual null checks; named parameters only

**Scripting best practices:**

- No aliases in scripts/modules — full cmdlet names (`Get-ChildItem`, not `ls`)
- `$ErrorActionPreference = 'Stop'` at script scope or `-ErrorAction Stop` on critical calls
- No `Invoke-Expression` — use call operator (`&`) or splatting
- `Write-Output` for pipeline, `Write-Verbose`/`Write-Debug` for diagnostics
- Splatting or natural line breaks instead of backtick continuation
- Cross-platform paths (`Join-Path`, `[System.IO.Path]`) — no hardcoded backslashes

**Module design:**

- Exported functions follow `Verb-Noun` naming (approved verbs from `Get-Verb`)
- `.psd1` manifests declare `FunctionsToExport` explicitly — no wildcards

**Security:**

- `[PSCredential]` type for credentials, not plain-text strings
- No `ConvertTo-SecureString -AsPlainText` outside test fixtures
- `SecretManagement` module for secret retrieval — no inline secrets

</details>

## Context Directory

Use `context_dir` to inject reference files (e.g. Helm values, config snippets, API specs) as read-only context into the system prompt. Files are read non-recursively, sorted alphabetically, and capped at 50 KB total.

Works with both `prompt` and `prompt_file` — context is injected into the system prompt, not the user prompt, so there is no conflict.

```yaml
# Pre-fetch reference material, then review with context
steps:
  - script: |
      mkdir -p $(Agent.TempDirectory)/context
      helm get values my-release -n production \
        > $(Agent.TempDirectory)/context/current-values.yaml
    displayName: "Fetch Helm values"

  - task: ClaudeCodeBaseTask@3
    inputs:
      prompt_file: "review-prompt.md"
      context_dir: "$(Agent.TempDirectory)/context"
      reviewer_helm: true
      anthropic_api_key: "$(ANTHROPIC_API_KEY)"
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

## PR Review Comments

When `post_pr_comments: true` (the default), the task posts issues Claude finds as inline PR thread comments after execution. This requires an ADO token passed via the `SYSTEM_ACCESSTOKEN` environment variable.

Severity filtering is controlled by `minimum_severity` (`CRITICAL > WARNING > SUGGESTION`). The default `WARNING` suppresses suggestions, which tend to be noisy on busy repos. Set to `SUGGESTION` to see everything, or `CRITICAL` to see blocking issues only.

```yaml
- task: ClaudeCodeBaseTask@3
  inputs:
    reviewer_terraform: true
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
    post_pr_comments: true
    minimum_severity: "WARNING" # default — omit to use the same value
  env:
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

### Using a dedicated service account

By default `$(System.AccessToken)` is used, which attributes comments to the pipeline's built-in build service identity. For clearer attribution in the ADO UI, use a dedicated Entra ID user with a PAT instead. See [`examples/pr-review-dedicated-account.yaml`](./examples/pr-review-dedicated-account.yaml) for a complete pipeline example.

**1. Create a dedicated Entra ID user** (e.g. `claude-code-azdo-service-account@your-tenant.com`) and add it to your ADO project with at minimum the **Reader** role so it can access pull requests.

**2. Sign in as that user and generate a PAT** with the following scopes:

| Scope                | Permission   | Required for                                 |
| -------------------- | ------------ | -------------------------------------------- |
| Pull Request Threads | Read & Write | Posting review threads                       |
| Code                 | Read & Write | PR approval vote (`approve_pr_on_no_issues`) |

**3. Store the PAT** as a secret variable (e.g. `CLAUDE_CODE_AZDO_TOKEN`) in an ADO variable group or as a pipeline secret.

**4. Pass it to the task** via `SYSTEM_ACCESSTOKEN`:

```yaml
- task: ClaudeCodeBaseTask@3
  inputs:
    post_pr_comments: true
  env:
    SYSTEM_ACCESSTOKEN: $(CLAUDE_CODE_AZDO_TOKEN)
```

If using a shared job template, reference the variable group there so all pipelines pick it up automatically:

```yaml
jobs:
  - job: claude_code_review
    variables:
      - group: claude-code # contains CLAUDE_CODE_AZDO_TOKEN
    steps:
      - task: ClaudeCodeBaseTask@3
        inputs:
          post_pr_comments: true
        env:
          SYSTEM_ACCESSTOKEN: $(CLAUDE_CODE_AZDO_TOKEN)
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

### Auto-approval

When `approve_pr_on_no_issues: true`, the task votes on the PR after every review run:

- **No new issues posted** → Approved ✅
- **Issues posted** → Waiting for author ⏳

This closes the review lifecycle automatically — once all issues are resolved (fixed, accepted, or suppressed), the next clean run approves the PR without manual intervention. The vote is attributed to the token owner (PAT or build service identity).

Requires the `Code — Read & Write` PAT scope in addition to `Pull Request Threads — Read & Write`.

```yaml
- task: ClaudeCodeBaseTask@3
  inputs:
    reviewer_terraform: true
    post_pr_comments: true
    approve_pr_on_no_issues: true
    pr_review_token: "$(CLAUDE_CODE_AZDO_TOKEN)"
```

## S3 State Caching

When `s3_state_bucket` is set, the task persists per-PR review state to S3 so that re-runs on subsequent commits can skip unchanged files and suppress already-posted issues.

```yaml
- task: ClaudeCodeBaseTask@3
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

State is stored at `s3://{bucket}/{prefix}/{org}/{project}/{repoName}/{prId}/state.json` (e.g. `s3://my-bucket/claude-pr-state/my-org/MyProject/my-repo/24963/state.json`) and includes:

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

The IAM role used by the pipeline needs two statements — object-level actions on the prefix, and `s3:ListBucket` on the bucket itself (required for the SDK to return 404 instead of 403 on a missing state file):

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::my-claude-state-bucket/claude-pr-state/*"
},
{
  "Effect": "Allow",
  "Action": "s3:ListBucket",
  "Resource": "arn:aws:s3:::my-claude-state-bucket"
}
```

When using Bedrock with IRSA, the same pod identity covers both Bedrock and S3 provided the role has the S3 actions above.

S3 read/write failures are non-fatal — the task logs a warning and continues with all files treated as dirty.

## How Review Works

The task assembles a prompt from several sources before spawning the Claude CLI. Understanding the composition order helps when debugging unexpected review behaviour or tuning prompts.

### Prompt composition

The final prompt sent to Claude is built from two channels:

**User prompt** (the content Claude reads as the "question") — assembled in this order:

1. **PR context preamble** — repository name, PR title, source → target branch (omitted when using `prompt_file`)
2. **Unified diff** — output of `git diff origin/{target}...HEAD` wrapped in a ` ```diff ` block, capped at 200 KB on a newline boundary. When truncated, a note tells Claude the remainder was omitted
3. **S3 cache context** — when caching is active and some files are unchanged, a preamble listing which files are unchanged and directing Claude to focus on the dirty files
4. **Your prompt** — the inline `prompt` text or the contents of `prompt_file`. When reviewers are enabled but no prompt is provided, this defaults to `"Perform the review."`

**System prompt** (`appendSystemPrompt`) — assembled in this order:

1. **Reviewer checklists** — concatenated system prompts for all enabled `reviewer_*` toggles
2. **Context directory files** — contents of files from `context_dir` (non-recursive, alphabetically sorted, 50 KB cap)
3. **User's `append_system_prompt`** — your custom system prompt addition
4. **PR issues output instruction** — when `post_pr_comments` is enabled, instructions telling Claude to emit a terminal JSON block of structured `ReviewIssue[]` items

### Diff injection

The task runs `git diff origin/{target}...HEAD` and injects the unified diff directly into the user prompt. This means reviewers analyse the diff as provided text — they do not need tool access to run git commands.

- **Without S3 caching**: the full diff of all changed files is included
- **With S3 caching, dirty files exist**: only dirty (changed since last review) files are diffed
- **With S3 caching, all files unchanged**: the diff is skipped entirely — the cache preamble tells Claude to review for context only
- **Truncation**: the diff is capped at 200 KB on a newline boundary; Claude is told the remainder was omitted

### S3 caching interaction

When `s3_state_bucket` is configured, the review pipeline changes behaviour across runs:

| Run                                               | Diff scope                    | Review scope                                          | Issues                                                    |
| ------------------------------------------------- | ----------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| **First run** (no cached state)                   | Full diff — all changed files | All changed files reviewed                            | All issues posted                                         |
| **Subsequent runs** (cached state, files changed) | Only dirty files diffed       | Dirty files reviewed; unchanged files carried forward | New issues posted; duplicates suppressed via fingerprints |
| **Subsequent runs** (cached state, no changes)    | No diff injected              | Cache preamble only                                   | No new review — cached issues carried forward             |

**Cache bust triggers** that force a full re-review:

- Model ID changes (e.g. switching from `claude-sonnet-4-6` to `claude-opus-4-6`)
- System prompt changes (any change to `append_system_prompt` or enabled reviewers)
- Different PR (state is keyed per PR)

### Prompt delivery

The Claude CLI reads stdin from a named FIFO pipe, not from command-line arguments. Three processes are co-ordinated:

1. `cat <prompt-file>` writes the assembled prompt to the pipe
2. `cat <pipe>` feeds the pipe contents to Claude's stdin
3. `claude -p --verbose --output-format stream-json` reads stdin and streams output

This avoids shell argument length limits and keeps the prompt off the process table.

## Task Outputs

| Output           | Description                                   |
| ---------------- | --------------------------------------------- |
| `conclusion`     | `success` or `failure`                        |
| `execution_file` | Path to the NDJSON execution log (JSON array) |

## Authentication

### Anthropic API (default)

```yaml
- task: ClaudeCodeBaseTask@3
  inputs:
    prompt: "..."
    anthropic_api_key: "$(ANTHROPIC_API_KEY)"
```

Store the key as a secret pipeline variable or in Azure Key Vault.

### OAuth token

```yaml
- task: ClaudeCodeBaseTask@3
  inputs:
    prompt: "..."
    claude_code_oauth_token: "$(CLAUDE_CODE_OAUTH_TOKEN)"
```

### AWS Bedrock

**IRSA / Pod Identity (preferred)** — when the agent pod is annotated with an IAM role,
the AWS SDK credential chain resolves credentials automatically. No static keys needed:

```yaml
steps:
  - task: ClaudeCodeBaseTask@3
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
  - task: ClaudeCodeBaseTask@3
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
  - task: ClaudeCodeBaseTask@3
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
- task: ClaudeCodeBaseTask@3
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
- task: ClaudeCodeBaseTask@3
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
