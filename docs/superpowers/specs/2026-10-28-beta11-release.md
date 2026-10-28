# beta.11 发布确认

- 发布页：https://github.com/chengyingzh433-stack/physics-question-bank/releases/tag/v1.1.0-beta.11
- 代码审阅：https://github.com/chengyingzh433-stack/physics-question-bank/pull/8（草稿 PR，基于上一阶段分支）
- 运行时代码提交：`5ae5decc5b9c286da326026a45c8307252016dd7`。
- GitHub Release ID：426237810；已发布为预发行版本。
- 五个附件均上传完成，逐一比对服务器大小与 SHA-256，和本地文件一致。
- Mac DMG：203655415 字节；SHA-256 `217604b240b3f5c0d62a12cfe98501abd980dc68f4846d927c86bebcff0c07a9`。
- 本机 `/Applications/物理教师题库管理系统.app` 已更新为最终 beta.11，应用已打开并停在录题首页。原稿与题库数据保留，旧应用有可恢复副本。
- 本机最终 app.asar SHA-256：`349e0e617d4d36b78ad3870aaab46f17f39a072aacccaea8225c93374e31d2c4`；与构建产物和 DMG 内一致。

类型检查、编译、打包、DMG 完整性和安装内容核对完成。真实 PDF 的单题主流程按用户本次授权手工操作，详见[交付说明](2026-10-28-frontend-workbench-delivery.md)。没有运行冒烟或自动化功能测试，没有调用 Doc2X；用户原试卷、题图、截图和样卷未上传。最终安装后另核对了折叠的图片属性、组卷高级设置和已保存标签显示。

完整功能、Word/WPS 排版、Windows 与其他格式仍待用户验收。[下一阶段连续录题方案](../plans/2026-10-28-continuous-single-question-plan.md)已完成撰写，功能尚未实现。
