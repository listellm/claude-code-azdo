## [1.0.2](https://github.com/listellm/claude-code-azdo/compare/v1.0.1...v1.0.2) (2026-02-27)

### Bug Fixes

- add actions: write permission to release job ([#8](https://github.com/listellm/claude-code-azdo/issues/8)) ([4a03a04](https://github.com/listellm/claude-code-azdo/commit/4a03a0433b8fe9d08568484d5c827b2ea91e171d))

## [1.0.1](https://github.com/listellm/claude-code-azdo/compare/v1.0.0...v1.0.1) (2026-02-27)

### Bug Fixes

- silence github success comments and trigger publish via dispatch ([#7](https://github.com/listellm/claude-code-azdo/issues/7)) ([82943f4](https://github.com/listellm/claude-code-azdo/commit/82943f4db5da08049f3cb67c643316fcb27625e8))

## 1.0.0 (2026-02-27)

### Features

- add claude_env input for custom environment variables ([#35](https://github.com/listellm/claude-code-azdo/issues/35)) ([1370ac9](https://github.com/listellm/claude-code-azdo/commit/1370ac97fbba9bddec20ea2924b5726bf10d8b94)), closes [#34](https://github.com/listellm/claude-code-azdo/issues/34)
- add fallback model support to Claude Code Base Action ([#67](https://github.com/listellm/claude-code-azdo/issues/67)) ([a96e183](https://github.com/listellm/claude-code-azdo/commit/a96e18384e69c006f80589bfb680974700118752))
- add OAuth token authentication support ([#75](https://github.com/listellm/claude-code-azdo/issues/75)) ([7be87bd](https://github.com/listellm/claude-code-azdo/commit/7be87bdadb76d2030ba77ebeee108a0b625740a7))
- add repository dispatch workflow to bump Claude Code version ([#38](https://github.com/listellm/claude-code-azdo/issues/38)) ([3b5e225](https://github.com/listellm/claude-code-azdo/commit/3b5e225b50aea341cb0e3e0608f2e3c4f961430f))
- add semantic-release for automated versioning ([#6](https://github.com/listellm/claude-code-azdo/issues/6)) ([dbd693c](https://github.com/listellm/claude-code-azdo/commit/dbd693c66372118301642c527e59cca441a7c9fe))
- add support for --system-prompt and --append-system-prompt args ([#33](https://github.com/listellm/claude-code-azdo/issues/33)) ([2e8d30a](https://github.com/listellm/claude-code-azdo/commit/2e8d30a451f19db374186a7b4d6a16dd374d3285))
- add workflow dispatch triggered release workflow ([#54](https://github.com/listellm/claude-code-azdo/issues/54)) ([4c629eb](https://github.com/listellm/claude-code-azdo/commit/4c629eb3c84875676a1d67fc376c00340d9e9862))
- modernise and refactor Azure pipeline task ([#1](https://github.com/listellm/claude-code-azdo/issues/1)) ([b5a14e0](https://github.com/listellm/claude-code-azdo/commit/b5a14e06cc817d6e35ffba804a4ae6e97d4953e8))
- update downstream action workflow to use deploy key ([#43](https://github.com/listellm/claude-code-azdo/issues/43)) ([5a31c2c](https://github.com/listellm/claude-code-azdo/commit/5a31c2c6f9ca35c738fc92e2548bdbaf708b447d))
- update release workflows to manage beta tag as latest ([#59](https://github.com/listellm/claude-code-azdo/issues/59)) ([3ce45ac](https://github.com/listellm/claude-code-azdo/commit/3ce45ac0c75f55840c9d97e4c94928dff2e5cccd))
- update release workflows to use repository dispatch ([#60](https://github.com/listellm/claude-code-azdo/issues/60)) ([4d2f064](https://github.com/listellm/claude-code-azdo/commit/4d2f064606b1c757911a10183c7edb07e99d2dca))

### Bug Fixes

- add pre-commit and normalise .yml to .yaml ([#5](https://github.com/listellm/claude-code-azdo/issues/5)) ([75bcd56](https://github.com/listellm/claude-code-azdo/commit/75bcd569dbf9b69ffd3d3ea0dd6a68823963c1a0))
- assign unique task ID for Marketplace publish ([e8ae2ee](https://github.com/listellm/claude-code-azdo/commit/e8ae2ee0e8822850ff9261fca942e397922ecf89))
- bump version to 1.0.8 for Marketplace republish ([bcb1f4c](https://github.com/listellm/claude-code-azdo/commit/bcb1f4c9ce6999c44f90b7c9296710c44c7c537a))
- filter version tags in release workflow to exclude non-version tags ([#55](https://github.com/listellm/claude-code-azdo/issues/55)) ([1a1ec07](https://github.com/listellm/claude-code-azdo/commit/1a1ec07a40c4b5414fd3d258bb9e5b2684b26877))
- grant contents: write for GitHub Release creation ([939e91e](https://github.com/listellm/claude-code-azdo/commit/939e91e255c0aa0b60ae646509558c8a50d88bfa))
- publisher ID, build script, and readme ([#4](https://github.com/listellm/claude-code-azdo/issues/4)) ([7858fce](https://github.com/listellm/claude-code-azdo/commit/7858fce66a466ba9f89963dd552ce9b11ba05b83))
- remove obsolete files and clean up repo ([#2](https://github.com/listellm/claude-code-azdo/issues/2)) ([855b08d](https://github.com/listellm/claude-code-azdo/commit/855b08d55d5efe1e161b219b938db2a7eec4f891))
- replace nested GitHub Actions syntax with proper shell conditional ([38b6d32](https://github.com/listellm/claude-code-azdo/commit/38b6d327e6799a5f97254677b8e4cf58ef24fb66))
- repo accuracy audit and cleanup ([#3](https://github.com/listellm/claude-code-azdo/issues/3)) ([721202f](https://github.com/listellm/claude-code-azdo/commit/721202f91c4f4a180e29fd2ff2985a99fefcc030))
- resolve TypeScript build configuration for Azure extension ([c3d1361](https://github.com/listellm/claude-code-azdo/commit/c3d1361441458d94e0d926401b16e86daf1d7730))
- update README for repo rename to claude-code-azdo ([#1](https://github.com/listellm/claude-code-azdo/issues/1)) ([fb9ef50](https://github.com/listellm/claude-code-azdo/commit/fb9ef50fccfb8989e52142750618e2be9c3dd672))
- use GITHUB_ACTION_PATH environment variable instead of github.action_path expression ([#42](https://github.com/listellm/claude-code-azdo/issues/42)) ([3ef5597](https://github.com/listellm/claude-code-azdo/commit/3ef5597e8b5a04fbb1cdf0789a8ad1e908abeedd)), closes [#41](https://github.com/listellm/claude-code-azdo/issues/41)
- use RELEASE_PAT for all GitHub API operations in downstream update workflow ([#29](https://github.com/listellm/claude-code-azdo/issues/29)) ([88efa2e](https://github.com/listellm/claude-code-azdo/commit/88efa2e4f964106a572edddef07d4243a6d422eb))
- write Claude settings to XDG config path when available ([#64](https://github.com/listellm/claude-code-azdo/issues/64)) ([56355f7](https://github.com/listellm/claude-code-azdo/commit/56355f77b19f27378aaf141b9b7e08cc43b542f6))
