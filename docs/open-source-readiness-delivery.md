# Open-source mainline preparation / 开源主线整理

The user selected MIT for project-authored code, documentation and bilingual
Skills. The root license, package metadata, standalone backend license and Skill
license copies now agree. Third-party terms remain independent.

用户确认自有代码、文档和中英文 Skill 使用 MIT。根许可、包元数据、后端与 Skill 的独立
许可副本保持一致；第三方条款不被替换。

## Mainline contents / 主线内容

- Archived 210 historical screenshots, concept comparisons and audit process
  files (24,954,915 bytes) outside tracked source. Historical links use the fixed
  pre-cleanup commit listed in [archive-index.md](archive-index.md).
- Retained current README artwork/screenshots, guides, contract examples,
  feature delivery explanations and effective tests.
- Redacted machine-specific paths in eight durable verification reports.
- Added contributor/security guidance, a changelog and asset/brand scope.
- Restored npm's default dependency audit setting. This does not constitute a
  vulnerability assessment or a promise that dependency audits pass.

Old commit bytes remain in Git history. No user projects, credentials or
application settings were removed or committed.

## License payloads / 分发声明

[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) links to complete installed
upstream texts for 26 frontend components and 31 Python dependencies/runtime
entries, including constrained development and packaging tools. Both imported
fonts retain their original OFL texts and copyright statements.

The frontend build includes a readable license directory. Windows packaging
adds root notices and complete license files; standalone Skill ZIPs include
their own MIT license. Missing payloads fail preparation before copying a
partial package. Dependency changes require refreshing upstream texts.

## Verification / 验证

- 152 frontend tests and 349 backend tests passed locally on Windows.
- 30 distributed source Skill HTTP checks and 30 checks against the newly built
  Windows executable passed without calling external models.
- Frontend/Sites build and four Sites boundary tests passed; protected hosting
  source files remained unchanged.
- Schema/example, bilingual-help and Skill synchronization checks passed.
- New Windows folder preview build completed; root notices, embedded font
  notices and both Skill ZIP license copies were checked against source files.
- Repository checks cover local documentation links, license mirrors, font
  notices, file-size limits, private/generated directories and report paths.
- GitHub Actions configuration has Windows/Ubuntu jobs, read-only permissions,
  immutable official Action references and no real provider credentials. Cloud
  run status is separate from local verification.

The first cloud run found that the full frontend suite required build files
that existed locally but not in a fresh checkout. The default `npm test` now
prepares its build before execution, and CI avoids a redundant second build.

A subsequent fresh-checkout run exposed Skill download links to ignored local
ZIP outputs. The guide now links to tracked Skill sources and explains local
packaging. Repository link checks require targets to be part of the publishable
file inventory, even when ignored build outputs exist on the developer machine.
Official Actions use Node 24-compatible v6 references; Ubuntu is pinned to 24.04
to keep the operating-system baseline stable.
The help-guide drift check also normalizes Git's Windows CRLF checkout endings
before comparing content, while still rejecting actual text differences.

This is local source/build acceptance, not clean Windows machine certification,
a legal certification, or real-provider output-quality acceptance.
