import { useEffect, useState } from 'react'
import { Group, ActionIcon, Text, Badge, Anchor } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { Link, Outlet, useLocation } from 'react-router-dom'

// 题目卷工作流步骤
const PAPER_STEPS = [
  { path: 'crop', label: '裁切' },
  { path: 'post', label: '后期处理' },
  { path: 'review', label: '原卷复查' },
  { path: 'answer', label: '答案匹配' }
] as const

// 答案卷工作流步骤（独立流程，与题目卷互不干扰）
const ANSWER_STEPS = [
  { path: 'crop', label: '裁切答案' },
  { path: 'post', label: '整理答案' },
  { path: 'answer', label: '答案匹配' }
] as const

type StepDef = { path: string; label: string }

// 每个步骤对应的跳转 URL
interface StepNav {
  step: StepDef
  href: string
}

/**
 * 工作流布局：全屏专注，顶栏做步骤导航。
 *
 * 根据当前试卷的 kind 自动切换两套步骤：
 * - 题目卷：裁切 → 后期处理 → 原卷复查 → 答案匹配（所有链接使用题目卷 id）
 * - 答案卷：裁切答案 → 整理答案 → 答案匹配
 *     裁切/整理 使用答案卷自身 id；答案匹配 使用 parent_paper_id（题目卷 id）
 *
 * M14.5：答案卷和题目卷流程完全隔离，顶栏不会互相跳转。
 */
export function WorkflowLayout() {
  const location = useLocation()

  // pathname 形如 "/crop/5" → parts = ['', 'crop', '5']
  const parts = location.pathname.split('/')
  const seg = parts[1]   // 当前路由段（crop / post / review / answer）
  const urlPaperId = parts[2]

  // 从 DB 读取试卷元信息，决定使用哪套步骤
  const [paperKind, setPaperKind] = useState<'paper' | 'answer' | null>(null)
  const [parentPaperId, setParentPaperId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = Number(urlPaperId)
    if (!Number.isFinite(id) || id <= 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    window.api
      .getPaper(id)
      .then((p) => {
        if (cancelled) return
        if (p?.kind === 'answer') {
          setPaperKind('answer')
          setParentPaperId(p.parent_paper_id != null ? String(p.parent_paper_id) : undefined)
        } else {
          setPaperKind('paper')
          setParentPaperId(urlPaperId)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          // 答案匹配页的 id 是题目卷 id，getPaper 正常返回，这里只是 fallback
          setPaperKind('paper')
          setParentPaperId(urlPaperId)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [urlPaperId])

  // 根据 kind 选步骤集，并构造带 href 的导航列表
  const steps: StepNav[] = (() => {
    if (loading || paperKind == null) return []

    if (paperKind === 'answer') {
      // 答案卷流程：裁切/整理 用答案卷 id，答案匹配 用题目卷 id
      return ANSWER_STEPS.map((s) => ({
        step: s,
        href: s.path === 'answer'
          ? `/answer/${parentPaperId ?? ''}`
          : `/${s.path}/${urlPaperId}`
      }))
    } else {
      // 题目卷流程：全部用题目卷 id（= parentPaperId，已在 effect 里设好）
      const pid = parentPaperId ?? urlPaperId
      return PAPER_STEPS.map((s) => ({
        step: s,
        href: `/${s.path}/${pid}`
      }))
    }
  })()

  // 当前步骤高亮：按 URL 路由段匹配
  const activeIdx = steps.findIndex((s) => s.step.path === seg)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Group
        h={52}
        px="md"
        justify="space-between"
        align="center"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap="sm">
          <ActionIcon variant="subtle" component={Link} to="/" title="返回主页">
            <IconArrowLeft size={18} />
          </ActionIcon>
          <Text fw={600}>
            {steps[activeIdx]?.step.label ?? '工作流'}
            <Text component="span" size="sm" c="dimmed" ml="xs">
              试卷 #{urlPaperId}
              {paperKind === 'answer' && (
                <Text component="span" size="xs" c="violet.5" ml={4}>答案卷</Text>
              )}
            </Text>
          </Text>
        </Group>

        <Group gap="xs">
          {loading || steps.length === 0 ? (
            <Text size="sm" c="dimmed">…</Text>
          ) : (
            steps.map((nav, i) => {
              const active = i === activeIdx
              const visited = i <= activeIdx
              const badge = (
                <Badge
                  variant={active ? 'filled' : visited ? 'light' : 'outline'}
                  color={active ? (paperKind === 'answer' ? 'violet' : 'sky') : 'gray'}
                  size="sm"
                  mr={4}
                >
                  {i + 1}
                </Badge>
              )
              // href 里含空串时不渲染链接（parentPaperId 还没就绪）
              if (nav.href.endsWith('/')) {
                return (
                  <Text key={nav.step.path} c="dimmed" style={{ opacity: 0.5 }}>
                    {badge}{nav.step.label}
                  </Text>
                )
              }
              const activeColor = paperKind === 'answer' ? 'violet' : 'sky'
              return (
                <Anchor
                  key={nav.step.path}
                  component={Link}
                  to={nav.href}
                  c={active ? `${activeColor}.7` : visited ? `${activeColor}.5` : 'dimmed'}
                  fw={active ? 700 : 400}
                  underline="never"
                >
                  {badge}
                  {nav.step.label}
                </Anchor>
              )
            })
          )}
        </Group>
      </Group>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  )
}
