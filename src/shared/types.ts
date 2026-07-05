// 主进程与渲染进程共享的类型契约（IPC DTO、领域模型）。
// M0-5 先放一个 ping 验证链路占位；后续里程碑逐步扩充。

export interface Api {
  ping(): Promise<string>
}
