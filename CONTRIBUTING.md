# Contributing / 参与开发

NPCs AI Studio is a local narrative authoring workbench. Please read the
[architecture](docs/architecture.md) and [AGENTS.md](AGENTS.md) before changing
project contracts or authoring workflows. Keep world facts, shared character
profiles, scene appearances, drafts and rehearsal state distinct.

NPCs AI Studio 是本地叙事创作工具。修改前请阅读架构与开发规范；不要把角色档案、出场、
草稿和预演状态混为同一份数据。小范围、可验证的修改更便于审阅。

## Setup / 环境

Use Node.js 24 and Python 3.13 for the CI baseline; Python 3.12+ is supported by
the backend contract. From the repository root:

```sh
npm ci
python -m venv backend/.venv
```

Windows PowerShell:

```powershell
backend/.venv/Scripts/python.exe -m pip install -e './backend[dev,package]' -c backend/requirements-dev.lock
npm run build
backend/.venv/Scripts/python.exe -m ludo_npc --open-browser
```

macOS / Linux:

```sh
backend/.venv/bin/python -m pip install -e './backend[dev,package]' -c backend/requirements-dev.lock
npm run build
backend/.venv/bin/python -m ludo_npc --open-browser
```

Frontend bridge tests choose the repository virtual environment for the current
OS. Set `NPCS_TEST_PYTHON` to a Python executable if using another environment.
Install the backend into that environment first. Current constraint versions
were verified on Windows; CI checks Windows and Ubuntu independently.

## Checks / 检查

```sh
npm test
npm run build
npm run test:sites
node scripts/generate-help-guide.mjs --check
node scripts/check-repository.mjs
```

Use the appropriate virtual-environment Python path above for:

```sh
python -m pytest backend/tests
python -m ludo_npc.tools generate --root . --check
python scripts/package-skills.py --check
```

After changing a contract, regenerate with `python -m ludo_npc.tools generate
--root .`, synchronize Skills with `python scripts/package-skills.py`, and review
the generated diff. License payloads are refreshed with `python
scripts/generate-third-party-notices.py` after installing dependencies.

本地协议测试不证明真实模型输出质量。请使用测试夹具，不要把真实 API Key、用户故事、
应用配置、日志或工程文件提交到仓库。真实服务商请求需要独立授权与说明。

## Pull requests / 提交修改

- Explain the problem, resulting behavior and checks actually run.
- Update Chinese and English author-facing guidance together.
- Preserve stable IDs, explicit migration, local recovery and credential isolation.
- Keep tests, lockfiles and generated contract resources reproducible.
- Put temporary screenshots and verification output in `.local-build/`; keep only
  current documentation assets and sanitized durable reports in tracked folders.
- Contributions are provided under this project's MIT license. You must have
  permission to contribute included code, text and assets. No CLA is currently required.

请在 PR 中说明问题、修改后的行为与真实验证结果；中英文说明一起维护。
投稿按项目 MIT 许可证提供，投稿者应有权提交对应代码、文本与素材。

Report ordinary bugs in [Issues](https://github.com/koronto11/ludo-npc-ai/issues),
with reproduction steps and sanitized diagnostics. For vulnerabilities, follow
[SECURITY.md](SECURITY.md). Be respectful, discuss the work, and do not harass
other contributors or post their private information.
