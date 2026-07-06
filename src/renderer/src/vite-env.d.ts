// 全局 ambient 声明（本文件无 import/export，作为脚本/全局 d.ts 处理）。
// vite 的 ?url 导入：返回资源 URL 字符串
declare module '*?url' {
  const src: string
  export default src
}
