# Third-party notices / 第三方组件说明

NPCs AI Studio's MIT license applies to project-authored material. It does not
replace upstream licenses. Preserve the applicable notices when redistributing.

本项目 MIT 许可证不替代第三方组件许可。分发时请携带对应版权和许可声明。

| Scope / 范围 | Complete upstream texts / 上游完整声明 |
| --- | --- |
| Frontend imports, including React, React Flow, icons, Inter and Noto Sans SC | [licenses/frontend.md](licenses/frontend.md) |
| Python runtime, constrained backend dependencies and packaging/development tools | [licenses/backend.md](licenses/backend.md) |

The bundled fonts retain SIL OFL 1.1, including their original copyright notices.
PyInstaller has a GPL exception for generated applications; it does not force
the project's code to adopt GPL. Other dependencies retain their own terms.
See the copied upstream texts for the authoritative terms and exceptions.

字体保留 OFL 许可与原版权说明。PyInstaller 生成程序适用其许可例外；它不会要求本项目
代码采用 GPL。具体条款以上游完整声明为准。

`npm ci` installs build-only Node dependencies under their own package licenses.
Those packages are not copied as `node_modules` into the application. If you
redistribute build tools or dependencies separately, retain their notices too.

Refresh these payloads after changing dependencies with
`python scripts/generate-third-party-notices.py` in the constrained build environment.
The distribution preparation copies these notices and license texts to
`dist/client/licenses/`; Windows packages also include a top-level copy.
Skill packages contain their own MIT `LICENSE` and generated project resources;
they do not include these external libraries or font binaries.
