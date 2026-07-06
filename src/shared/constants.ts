// 导出与渲染的全局常量（R7: 集中定义，可在设置里改）。

/** 默认导出 DPI（R7）。屏幕显示用 ~96，入库/导出用此高 DPI。 */
export const EXPORT_DPI = 300

/** 屏幕显示基础 DPI（技术设计 4 节，适应宽度计算用）。 */
export const SCREEN_BASE_DPI = 96

/** 导出页面 A4 尺寸（pt）。1pt = 1/72 inch。A4 = 210×297mm。 */
export const A4_WIDTH_PT = 595.28
export const A4_HEIGHT_PT = 841.89

/** 导出页边距 15mm（R4），换算为 pt：15mm = 15/25.2 * 72 ≈ 42.52pt。 */
export const EXPORT_MARGIN_PT = (15 / 25.4) * 72

/** 缩略图最大边长（px，低 DPI 预览用）。 */
export const THUMB_MAX_PX = 1000
