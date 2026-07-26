import { useState, useEffect, useCallback } from 'react'
import {
  AppShell, Group, NavLink, Badge, ActionIcon, Text,
  useMantineColorScheme, Drawer, Select, Button, Stack, Divider,
  LoadingOverlay
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  IconHome2,
  IconDatabase,
  IconClipboardList,
  IconTemplate,
  IconSun,
  IconMoon,
  IconMenu2,
  IconSettings,
  IconDownload,
  IconTransfer,
  IconRefresh
} from '@tabler/icons-react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import { useBasketCount } from '../useBasketCount'

const NAV = [
  { to: '/', label: '主页', icon: IconHome2 },
  { to: '/bank', label: '题库浏览', icon: IconDatabase },
  { to: '/basket', label: '组卷篮', icon: IconClipboardList },
  { to: '/templates', label: '题型与模板', icon: IconTemplate }
]

const DPI_OPTIONS = [
  { value: '150', label: '150 DPI（快速，适合预览）' },
  { value: '200', label: '200 DPI（标准）' },
  { value: '300', label: '300 DPI（高清，推荐）' },
  { value: '600', label: '600 DPI（超清，文件较大）' }
]

export function LibraryLayout() {
  const location = useLocation()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const { count } = useBasketCount()
  const [mobileOpen, { toggle }] = useDisclosure()
  const [settingsOpen, { open: openSettings, close: closeSettings }] = useDisclosure(false)
  const [dpi, setDpi] = useState<string>('300')
  const [storagePath, setStoragePath] = useState<string>('')
  const [defaultStoragePath, setDefaultStoragePath] = useState<string>('')
  const [migrating, setMigrating] = useState(false)

  // 加载当前 DPI 设置和存储路径
  useEffect(() => {
    if (!settingsOpen) return
    window.api.getSetting('export_dpi', '300').then(setDpi)
    window.api.getCurrentStoragePath().then(setStoragePath)
    window.api.getDefaultStoragePath().then(setDefaultStoragePath)
  }, [settingsOpen])

  const handleDpiChange = async (value: string | null) => {
    if (!value) return
    setDpi(value)
    await window.api.setSetting('export_dpi', value)
    notifications.show({ message: `入库渲染 DPI 已设为 ${value}`, color: 'green' })
  }

  const handleBackup = async () => {
    try {
      const path = await window.api.backupDatabase()
      if (path) {
        notifications.show({ message: `数据库已备份到：${path}`, color: 'green' })
      }
    } catch (e) {
      notifications.show({ title: '备份失败', message: String(e), color: 'red' })
    }
  }

  const handleChangeStorage = useCallback(async () => {
    const dir = await window.api.openDirectoryDialog()
    if (!dir) return
    setMigrating(true)
    try {
      await window.api.migrateStorage(dir)
      setStoragePath(dir)
      notifications.show({ title: '存储位置已更改', message: `数据已迁移到：${dir}`, color: 'green' })
    } catch (e) {
      notifications.show({ title: '迁移失败', message: String(e), color: 'red' })
    } finally {
      setMigrating(false)
    }
  }, [])

  const handleResetStorage = useCallback(async () => {
    setMigrating(true)
    try {
      await window.api.migrateStorage(defaultStoragePath)
      setStoragePath(defaultStoragePath)
      notifications.show({ title: '已恢复默认存储位置', message: defaultStoragePath, color: 'green' })
    } catch (e) {
      notifications.show({ title: '迁移失败', message: String(e), color: 'red' })
    } finally {
      setMigrating(false)
    }
  }, [defaultStoragePath])

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !mobileOpen } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <ActionIcon variant="subtle" onClick={toggle} hiddenFrom="sm">
              <IconMenu2 size={18} />
            </ActionIcon>
            <Text fw={700} c="sky.7">
              物理教师题库管理系统
            </Text>
          </Group>
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              onClick={openSettings}
              title="设置"
            >
              <IconSettings size={18} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              onClick={toggleColorScheme}
              title={colorScheme === 'dark' ? '切换到亮色' : '切换到暗色'}
            >
              {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV.map((item) => {
          const active =
            item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={active}
              rightSection={
                item.to === '/basket' && count > 0 ? (
                  <Badge size="xs" circle color="sky">
                    {count}
                  </Badge>
                ) : undefined
              }
            />
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      {/* 设置 Drawer（M12-2：DPI + 备份 + 存储位置）*/}
      <Drawer opened={settingsOpen} onClose={closeSettings} title="设置" padding="md" size="sm" position="right">
        <div style={{ position: 'relative' }}>
          <LoadingOverlay visible={migrating} overlayProps={{ blur: 2 }} />
          <Stack gap="md">
            <Divider label="数据存储" />
            <Stack gap="xs">
              <Text size="sm" fw={500}>当前存储位置</Text>
              <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {storagePath || '加载中…'}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconTransfer size={14} />}
                  onClick={handleChangeStorage}
                  disabled={migrating}
                >
                  更改位置
                </Button>
                {storagePath !== defaultStoragePath && (
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    leftSection={<IconRefresh size={14} />}
                    onClick={handleResetStorage}
                    disabled={migrating}
                  >
                    恢复默认
                  </Button>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                题目图片和 PDF 文件的存储目录。更改后现有数据将自动迁移到新位置。
              </Text>
            </Stack>

            <Divider label="入库渲染" />
          <Select
            label="渲染 DPI（影响入库题图清晰度）"
            description="DPI 越高题图越清晰，但文件越大、入库越慢。修改后对新入库的题目生效。"
            data={DPI_OPTIONS}
            value={dpi}
            onChange={handleDpiChange}
            allowDeselect={false}
          />

          <Divider label="数据维护" />
          <Button
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={handleBackup}
          >
            备份数据库
          </Button>
          <Text size="xs" c="dimmed">
            将完整数据库导出为文件，可用于迁移或灾难恢复。
          </Text>
          </Stack>
        </div>
      </Drawer>
    </AppShell>
  )
}
