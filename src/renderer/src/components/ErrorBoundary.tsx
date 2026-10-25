import { Component, type ReactNode } from 'react'
import { Stack, Text, Button, Code, Alert } from '@mantine/core'
import { IconAlertTriangle, IconHome, IconRefresh } from '@tabler/icons-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 顶层错误边界。
 *
 * 没有它的话，任何一个渲染期异常（比如手动操作 React 托管 DOM 触发的
 * removeChild DOMException）都会让整棵组件树卸载 → 白屏 → 只能重启应用，
 * 且看不到任何线索。有了它，崩溃被限制在这里并把 message/stack 显示出来，
 * 用户能直接回主页继续用。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error('[ErrorBoundary] 渲染异常', error, info?.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  private handleGoHome = (): void => {
    this.setState({ error: null })
    window.location.hash = '#/'
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <Stack p="xl" gap="md" maw={720} mx="auto" mt="xl">
        <Alert
          icon={<IconAlertTriangle size={18} />}
          color="red"
          title="页面出错了"
          variant="light"
        >
          页面暂时无法显示。已经保存的题目和原稿不会因此被删除；请先重试，录题页如有本机恢复副本会提示恢复。未提交修改请以恢复结果为准。
        </Alert>

        <Text size="sm" fw={600}>
          错误信息
        </Text>
        <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
        </Code>

        <Stack gap="xs">
          <Button leftSection={<IconHome size={16} />} onClick={this.handleGoHome}>
            返回主页
          </Button>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={this.handleReset}
          >
            重试这一页
          </Button>
        </Stack>
      </Stack>
    )
  }
}

export default ErrorBoundary
