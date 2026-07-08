import { createTheme, MantineColorsTuple } from '@mantine/core'

// 设计令牌集中处。主色用 sky/indigo 系的沉稳蓝,适合桌面工具。
// 改这里一处,全应用主色跟着变。
const sky: MantineColorsTuple = [
  '#eef6ff',
  '#d9ebff',
  '#bcdcff',
  '#9ecbff',
  '#84cdf1',
  '#5eb1ef',
  '#3ba2ed',
  '#1e8fe6',
  '#0b7de0',
  '#0068c2'
]

export const theme = createTheme({
  primaryColor: 'sky',
  primaryShade: { light: 6, dark: 5 },
  fontFamily:
    "'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontFamilyMonospace: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
  defaultRadius: 'md',
  headings: { fontWeight: '600' },
  colors: { sky },
  components: {
    Button: { defaultProps: { radius: 'md' } },
    Card: { defaultProps: { radius: 'md', shadow: 'sm' } }
  }
})
