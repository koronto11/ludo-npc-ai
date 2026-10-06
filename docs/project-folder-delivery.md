# 独立项目文件夹交付

2026-10-06。新建项目默认创建同名文件夹，用户只需选择保存位置。名称中的非法文件字符会转换为安全目录名，Windows 保留名称也会处理；同名目录已存在时要求更改名称或位置，不复用或覆盖已有目录。

```text
我的项目/
  营地故事/
    营地故事.ludo.json
    .npcs-project.json
    backups/
      previous.ludo.json
      history/
    exports/
```

工程 JSON 仍保存全部故事、人物、关卡、对白、草稿、布局和试玩记录。目录识别文件保存项目 ID 与相对文件名；复制整个目录后可以在新位置继续打开并恢复。只复制工程 JSON 也可编辑，按旧单文件布局保存。项目改名不会自动重命名磁盘文件或目录。

「项目 → 打开项目文件夹」直接打开当前目录。备份集中在 `backups`，保留上一版本和最近 20 个历史恢复点。新建时记住的是父级集合位置，下次不会嵌套创建到当前项目内部。

导出仍先预览，新增「保存到项目 exports」；Markdown、CSV、完整工程 JSON 都支持。重复保存生成新文件名，过期预览拒绝写入并要求重新预览。下载到其他位置仍可使用。

旧工程无需迁移即可打开，保留原 `.bak` / `.history` 行为。「项目 → 整理为项目文件夹」先保存，再复制工程和有效备份，成功后继续编辑新文件，原文件与原备份保留。此前下载的导出不会自动查找或搬移。复制失败时不切换绑定、不删除原文件；已写出的部分目标文件保留供恢复。

模型连接、加密密钥和模板库位于本机应用配置目录，多项目共用；项目与导出不包含它们。目录结构未改变项目 Schema。旧 API 调用与 Skill 生成仍可创建单个文件，UI 显式使用 `layout: folder`；已有 Skill 作品可以通过整理入口集中管理。

验证：298 项 Python、109 项前端测试、Ruff、Schema 漂移检查、Skill 资源检查和前端构建通过。新增测试覆盖目录冲突、备份复制失败、旧布局兼容、恢复、历史上限、跨位置搬迁、导出冲突和路径隔离。浏览器使用独立测试工程完成新建、导出落盘、打开旧文件及复制整理；未调用远程模型，也未搬移当前作者工程。

Windows 新程序包实际启动三次，通过 28 项真实本机 HTTP 检查，覆盖旧单文件保存/重开、独立目录保存、三种集中导出、目录冲突、旧文件整理、目录复制后重启恢复和父级位置记忆。证据见 [程序包检查报告](verification/project-folder-package-report.json)。体验包为 `release/npcs-ai-studio-folders/NPCsAIStudio-project-folders-preview-20261006.zip`；仍属于本机验收，干净 Windows 机器验收尚未完成。

[新建项目目录预览](https://github.com/koronto11/ludo-npc-ai/blob/e96ecb7f7670362fe95fbc83d8c9006085d77099/docs/screenshots/project-folder-new.png)

[导出集中保存](https://github.com/koronto11/ludo-npc-ai/blob/e96ecb7f7670362fe95fbc83d8c9006085d77099/docs/screenshots/project-folder-export.png)
