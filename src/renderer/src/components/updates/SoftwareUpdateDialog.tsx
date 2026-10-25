import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Divider, Group, Loader, Modal, Paper, Progress, ScrollArea, Stack, Switch, Text } from '@mantine/core'
import { IconCheck, IconDownload, IconExternalLink, IconRefresh } from '@tabler/icons-react'
import { updateErrorMessage, type SoftwareUpdatesController } from './useSoftwareUpdates'

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
const formatDate = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString()
}

export function SoftwareUpdateDialog({ opened, onClose, controller }: {
  opened: boolean; onClose: () => void; controller: SoftwareUpdatesController
}) {
  const { state, error, pending, refresh, check, download, cancel, install, preferences, openRelease } = controller
  const [confirmInstall, setConfirmInstall] = useState(false)
  const [savedWork, setSavedWork] = useState(false)
  const phase = state?.phase
  const checking = phase === 'checking' || Boolean(pending.check)
  const downloading = phase === 'downloading' || Boolean(pending.download)
  const installing = phase === 'installing' || Boolean(pending.install)
  const working = checking || downloading || installing
  const release = state?.release
  useEffect(() => { setConfirmInstall(false); setSavedWork(false) }, [release?.version])
  const platformSupported = state?.platform === 'darwin' || state?.platform === 'win32'
  const platformName = state?.platform === 'darwin' ? 'macOS' : state?.platform === 'win32' ? 'Windows' : state?.platform === 'linux' ? 'Linux' : state?.platform
  const archName = state?.arch === 'arm64' ? state.platform === 'darwin' ? 'Apple 芯片' : 'ARM64' : state?.arch === 'x64' ? '64 位' : state?.arch
  const total = state?.totalBytes || release?.assetSize || 0
  const downloaded = state?.downloadedBytes ?? 0
  const percent = total > 0 ? Math.max(0, Math.min(100, downloaded / total * 100)) : 0
  const hasAsset = Boolean(release?.assetName)
  const canDownload = Boolean(state?.packaged && platformSupported && hasAsset &&
    (phase === 'available' || phase === 'error') && !working && !pending.preferences)
  const message = state?.message ? updateErrorMessage(state.message) : ''
  return <>
    <Modal opened={opened} onClose={() => { if (!installing) onClose() }} title="软件更新" size="lg"
      closeOnClickOutside={!installing} closeOnEscape={!installing} withCloseButton={!installing}>
      <Stack gap="md">
        {error && <Alert color="red" title="暂未完成操作">{error}</Alert>}
        {!state ? <>
          {!error && <Group><Loader size="sm" /><Text size="sm">读取更新信息…</Text></Group>}
          {error && <Button variant="light" onClick={() => void refresh()}>重新读取</Button>}
        </> : <>
          <Group justify="space-between" align="start">
            <div><Text size="sm" c="dimmed">当前版本</Text><Text fw={700} size="lg">{state.currentVersion}</Text>
              <Text size="xs" c="dimmed">{platformName} · {archName}{state.packaged ? '' : ' · 开发运行'}</Text></div>
            <Button variant="light" leftSection={<IconRefresh size={15} />} loading={checking}
              disabled={downloading || installing || Boolean(pending.preferences)} onClick={() => void check()}>
              {phase === 'error' && !release ? '重新检查' : '检查新版本'}</Button>
          </Group>
          <Stack gap="sm">
            <Switch checked={state.preferences.autoCheck} disabled={working || Boolean(pending.preferences)}
              label="启动后自动检查新版本" description="只检查版本，由你决定是否下载和安装。"
              onChange={(event) => void preferences({ ...state.preferences, autoCheck: event.currentTarget.checked })} />
            <Switch checked={state.preferences.includePrerelease} disabled={working || Boolean(pending.preferences)}
              label="接收测试版更新" description="开启后会同时查找正式版和测试版。"
              onChange={(event) => void preferences({ ...state.preferences, includePrerelease: event.currentTarget.checked })} />
            {pending.preferences && <Text size="xs" c="dimmed">正在保存更新偏好…</Text>}
          </Stack>
          <Text size="xs" c="dimmed">{state.checkedAt ? `上次检查：${formatDate(state.checkedAt)}` : '尚未检查新版本'}</Text>
          {!state.packaged && <Alert color="gray">当前处于开发运行，可以查看版本信息。请使用安装后的应用下载和安装更新。</Alert>}
          {!platformSupported && <Alert color="orange">此系统暂不支持应用内安装。可以打开发布页，查看是否有适合的安装方式。</Alert>}
          {checking && <Group gap="sm"><Loader size="sm" /><Text size="sm">正在检查发布的版本…</Text></Group>}
          {phase === 'current' && !error && <Alert color="green" icon={<IconCheck size={18} />}>未发现比当前版本更新的{state.preferences.includePrerelease ? '正式版或测试版' : '正式版'}。</Alert>}
          {phase === 'idle' && !checking && <Text size="sm" c="dimmed">点击“检查新版本”查看是否有可用更新。</Text>}
          {message && <Alert color={phase === 'error' ? 'red' : phase === 'installing' ? 'blue' : 'gray'}>{message}</Alert>}
          {release && <Paper withBorder p="md"><Stack gap="sm">
            <Group justify="space-between" align="start"><div><Text fw={600}>新版本 {release.version}</Text>
              <Text size="xs" c="dimmed">发布于 {formatDate(release.publishedAt)}</Text></div>
              <Badge color={release.prerelease ? 'orange' : 'green'}>{release.prerelease ? '测试版' : '正式版'}</Badge></Group>
            {release.name && release.name !== release.version && <Text size="sm">{release.name}</Text>}
            <Divider label="更新说明" />
            <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
              <Text component="div" size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{release.notes.trim() || '此版本暂未提供更新说明。'}</Text>
            </ScrollArea.Autosize>
            {hasAsset && <Text size="xs" c="dimmed">适合此电脑的安装包{release.assetSize ? ` · ${formatBytes(release.assetSize)}` : ''}</Text>}
            {!hasAsset && <Alert color="orange">此版本尚未提供适合本机系统与处理器的安装包。可以查看发布页，或稍后重新检查。</Alert>}
            {downloading && <Stack gap="xs">
              <Group justify="space-between"><Text size="sm">正在下载安装包</Text>
                <Text size="sm">{formatBytes(downloaded)}{total > 0 ? ` / ${formatBytes(total)} · ${Math.floor(percent)}%` : ''}</Text></Group>
              {total > 0 ? <Progress value={percent} animated striped aria-label="安装包下载进度" /> : <Progress value={100} animated striped aria-label="正在下载安装包，大小待确认" />}
              <Text size="xs" c="dimmed">下载后会核对安装包。可以收起此面板继续工作，下载留在后台进行。</Text>
              <Group justify="flex-end"><Button size="xs" variant="default" loading={Boolean(pending.cancel)} disabled={Boolean(pending.cancel) || installing}
                onClick={() => void cancel()}>取消下载</Button></Group>
            </Stack>}
            {phase === 'ready' && !installing && <Alert color="green">安装包已下载并完成校验。准备好后点击“安装更新”。</Alert>}
            {installing && <Alert color="blue"><Group gap="sm"><Loader size="sm" /><Text size="sm">正在准备安装，请稍候…</Text></Group>
              <Text size="sm" mt="xs">{state.platform === 'win32' ? '准备完成后应用会正常退出并打开安装程序，请按提示完成安装。' : '准备完成后应用会正常退出并重新打开。'}如出现未保存内容提示，可以取消退出，继续保存当前工作。</Text></Alert>}
            <Group justify="space-between">
              <Button size="xs" variant="subtle" leftSection={<IconExternalLink size={14} />} disabled={installing || Boolean(pending.release)}
                onClick={() => void openRelease()}>查看 GitHub 发布页</Button>
              {phase === 'ready' ? <Button disabled={!state.packaged || !platformSupported || installing || checking || downloading || Boolean(pending.cancel) || Boolean(pending.preferences)}
                loading={installing} onClick={() => { setSavedWork(false); setConfirmInstall(true) }}>安装更新</Button>
                : !downloading && !installing && <Button leftSection={<IconDownload size={16} />} disabled={!canDownload}
                  onClick={() => void download()}>{phase === 'error' ? '重新下载' : '下载安装包'}</Button>}
            </Group>
          </Stack></Paper>}
          {!release && phase === 'error' && <Text size="xs" c="dimmed">检查失败不会影响当前版本。恢复网络后可以重试。</Text>}
          {!release && <Button variant="subtle" size="xs" leftSection={<IconExternalLink size={14} />} disabled={installing || Boolean(pending.release)}
            onClick={() => void openRelease()}>查看 GitHub 发布页</Button>}
          <Text size="xs" c="dimmed">更新来源为此项目的 GitHub 发布页，无需登录 GitHub。安装会替换应用，题库资料和 Doc2X 设置保留。</Text>
        </>}
      </Stack>
    </Modal>
    <Modal opened={confirmInstall && opened} onClose={() => { if (!installing) setConfirmInstall(false) }} title="准备安装更新" size="md"
      closeOnEscape={!installing} closeOnClickOutside={!installing} withCloseButton={!installing}>
      <Stack>
        <Text size="sm">安装 {release?.version ?? '新版本'} {state?.platform === 'win32' ? '会关闭应用并打开 Windows 安装程序，请按提示完成安装。' : '会关闭并重新打开应用。'}请先保存题目编辑、识别候选和组卷设置。</Text>
        <Checkbox checked={savedWork} disabled={installing} label="我已保存当前工作，可以开始安装。"
          onChange={(event) => setSavedWork(event.currentTarget.checked)} />
        <Group justify="flex-end"><Button variant="default" disabled={installing} onClick={() => setConfirmInstall(false)}>暂不安装</Button>
          <Button disabled={!savedWork || phase !== 'ready' || !state?.packaged || !platformSupported || downloading || Boolean(pending.cancel)} loading={installing} onClick={() => {
            setConfirmInstall(false); void install()
          }}>{state?.platform === 'win32' ? '退出并打开安装程序' : '开始安装并重新打开'}</Button></Group>
      </Stack>
    </Modal>
  </>
}
