import { Group, ActionIcon, Text, Badge, Anchor } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { Link, useParams, Outlet, useLocation } from 'react-router-dom'

// 工作流页(裁切/后期/复查)用此布局:全屏专注,顶栏做步骤指示。
const STEPS = [
  { path: 'crop', label: '裁切' },
  { path: 'post', label: '后期处理' },
  { path: 'review', label: '原卷复查' }
] as const

export function WorkflowLayout() {
  const { paperId } = useParams()
  const location = useLocation()
  const seg = location.pathname.split('/')[2] // /crop/:id -> crop
  const activeIdx = STEPS.findIndex((s) => s.path === seg)

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
            {STEPS[activeIdx]?.label ?? '工作流'}
            <Text component="span" size="sm" c="dimmed" ml="xs">
              试卷 #{paperId}
            </Text>
          </Text>
        </Group>
        <Group gap="xs">
          {STEPS.map((s, i) => {
            const active = i === activeIdx
            const visited = i <= activeIdx
            return (
              <Anchor
                key={s.path}
                component={Link}
                to={`/${s.path}/${paperId}`}
                c={active ? 'sky.7' : visited ? 'sky.5' : 'dimmed'}
                fw={active ? 700 : 400}
                underline="never"
              >
                <Badge
                  variant={active ? 'filled' : visited ? 'light' : 'outline'}
                  color={active ? 'sky' : 'gray'}
                  size="sm"
                  mr={4}
                >
                  {i + 1}
                </Badge>
                {s.label}
              </Anchor>
            )
          })}
        </Group>
      </Group>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  )
}
