教师题库 M18 / M19：可编辑题目、Word 导出及单题识别 — 第三方组件说明

本模块使用：
Tiptap 3.32.0 (MIT) https://github.com/ueberdosis/tiptap
MathLive 0.111.1 (MIT) https://github.com/arnog/mathlive
docx 9.14.0 (MIT) https://github.com/dolanmiu/docx
mathml2omml 0.5.0 (LGPL-3.0-or-later) https://github.com/fiduswriter/mathml2omml
saxes 6.0.0 (ISC) https://github.com/lddubeau/saxes

M19 新增本地结果解析组件（MIT）：
unified 11.0.5、remark-parse 11.0.0、remark-math 6.0.0、remark-gfm 4.0.1、
fflate 0.8.3、htmlparser2 10.0.0；完整新增依赖许可见 M19-NOTICES.txt。
micromark-extension-math 的 KaTeX 依赖固定为 0.19.1，避免旧版已知问题；
本应用使用 Markdown 语法树，不使用该依赖生成的 HTML。
Doc2X 识别引擎不随本程序分发；用户自行启用其外部服务并承担账户费用。

mathml2omml 版权所有 Johannes Wilm 及贡献者。本程序使用其未修改发行版，
该库及其使用受随附 LGPL-3.0 与 GPL-3.0 条款约束。
完整对应源码在同目录 mathml2omml-0.5.0-source.tar.gz，源提交：
0ddeb8b59ff1a97796b25d8f682dfb410febde1d。

本程序将 mathml2omml 保留为独立运行时模块，未合并到应用业务代码中。
允许修改该库，以及为调试这些修改所需的逆向工程，不另加限制。
若在可写的安装副本上替换接口兼容版本：
- Mac：应用包 Contents/Resources/app.asar.unpacked/node_modules/mathml2omml/
- Windows：安装目录 resources/app.asar.unpacked/node_modules/mathml2omml/
保留原目录结构/package.json，替换 dist 文件后重新启动应用。
如系统因包被修改而拒绝启动，可从项目源代码重新构建安装包。

应用源码及锁定的依赖版本：
https://github.com/chengyingzh433-stack/physics-question-bank
源码仓库提供 package-lock.json、electron-builder.yml 与构建脚本；
在 Node.js 24 环境 npm ci 后，npm run build 编译，npm run dist:mac 制作 Mac 包。
本轮未改写上述第三方组件源码。

M21 多来源录题新增本地组件：
docx-preview 0.4.1 (Apache-2.0) https://github.com/VolodymyrBaydalka/docxjs
html-to-image 1.11.13 (MIT) https://github.com/bubkoo/html-to-image
JSZip 3.10.1（按 MIT 许可使用）https://github.com/Stuk/jszip
对应许可与 JSZip 运行时依赖说明见 docx-preview-Apache-2.0.txt、
html-to-image-MIT.txt、jszip-LICENSE.markdown、M21-NOTICES.txt。
上述依赖均未经修改；DOCX 预览与组题快照在本机处理。
