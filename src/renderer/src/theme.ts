import { createTheme, MantineColorsTuple } from '@mantine/core'

// 桌面工作台设计令牌。sky 保留原色名以兼容既有组件。
// 改这里一处,全应用主色跟着变。
const sky: MantineColorsTuple = [
  '#edf8f6', '#d5efea', '#a9dcd2', '#7bc6b8', '#51b09e',
  '#359987', '#247e70', '#1e6c60', '#19584f', '#14483f'
]

export const theme = createTheme({
  primaryColor: 'sky',
  primaryShade: { light: 6, dark: 5 },
  fontFamily:
    "'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontFamilyMonospace: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
  defaultRadius: 'md',
  fontSizes: { xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '20px' },
  headings: { fontWeight: '600' },
  colors: { sky },
  components: {
    Button: { defaultProps: { radius: 'md' } },
    Card: { defaultProps: { radius: 'md', shadow: 'none' } },
    Input: { defaultProps: { radius: 'sm' } }
  }
})
