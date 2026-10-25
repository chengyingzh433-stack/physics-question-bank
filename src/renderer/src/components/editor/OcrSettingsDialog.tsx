import { useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, PasswordInput, Stack, Switch, Text } from '@mantine/core'
import type { OcrSettingsDTO } from '@shared/ocr'
import { ocrErrorMessage } from './ocrMessages'

export function OcrSettingsDialog({ opened, onClose, onSaved }: {
  opened: boolean; onClose: () => void; onSaved?: (value: OcrSettingsDTO) => void
}) {
  const [settings, setSettings] = useState<OcrSettingsDTO | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  useEffect(() => {
    if (!opened) { setApiKey(''); return }
    let active = true
    setSettings(null); setError(''); setApiKey('')
    window.api.getOcrSettings().then((value) => {
      if (!active) return
      setSettings(value); setEnabled(value.enabled); setRemember(value.remembered)
    }).catch((e) => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [opened])
  const save = async (clearKey = false) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const value = await window.api.saveOcrSettings(clearKey ? { enabled: false, clearKey: true } : {
        enabled, ...(apiKey.trim() ? { apiKey: apiKey.trim(), remember } : {})
      })
      setSettings(value); setEnabled(value.enabled); setRemember(value.remembered); setApiKey(''); onSaved?.(value)
      if (!clearKey) onClose()
    } catch (e) { setError(String(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <Modal opened={opened} onClose={() => { if (!busy) onClose() }} title="Doc2X 识别设置" size="lg"
    closeOnEscape={!busy} closeOnClickOutside={!busy} withCloseButton={!busy}>
    <Stack>
      <Text size="sm">开启后，只有你在上传预览中确认的题图副本会发送给 Doc2X。手工编辑和 Word 导出不依赖此服务。</Text>
      {error && <Alert color="red">{ocrErrorMessage(error)}</Alert>}
      {!settings ? !error && <Loader /> : <>
        <Switch checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.currentTarget.checked)} label="启用 Doc2X 云识别" />
        <Group gap="xs"><Text size="sm">密钥状态</Text><Badge color={settings.hasKey ? 'green' : 'gray'}>
          {settings.hasKey ? settings.remembered ? '已安全保存在本机' : '仅本次启动有效' : '尚未设置'}</Badge></Group>
        {settings.keyError && <Alert color="orange">{ocrErrorMessage(settings.keyError)}</Alert>}
        <PasswordInput label={settings.hasKey ? '更新 API Key（留空保留现有密钥）' : 'API Key'} value={apiKey} disabled={busy}
          autoComplete="new-password" spellCheck={false} onChange={(event) => setApiKey(event.currentTarget.value)}
          description="已有密钥不会回显，也不会写入题目、日志或导出文件。" />
        <Checkbox checked={remember} disabled={busy || !settings.secureStorageAvailable || !apiKey.trim()}
          onChange={(event) => setRemember(event.currentTarget.checked)} label="用系统安全存储记住新密钥"
          description={settings.secureStorageAvailable ? '不勾选时，新密钥只在本次应用启动期间使用。更改保存方式需重新输入密钥。' : '当前系统安全存储不可用，可临时使用密钥；不会退回明文保存。'} />
        <Text size="xs" c="dimmed">每次单图识别消耗服务额度。暂停或关闭本地等待不代表远端退费；额度和费用以你的 Doc2X 账户为准。</Text>
        <Group justify="space-between">
          <Button variant="subtle" disabled={busy} onClick={() => void window.api.openDoc2xConsole().catch((e) => setError(String(e)))}>打开 Doc2X 控制台</Button>
          <Button variant="subtle" color="red" disabled={busy || !(settings.hasKey || settings.remembered || settings.keyError)} onClick={() => {
            if (window.confirm('清除此电脑上的 Doc2X 密钥并停用云识别？已有题目和候选会保留。')) void save(true)
          }}>清除密钥</Button>
        </Group>
        <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={onClose}>取消</Button>
          <Button loading={busy} disabled={enabled && !settings.hasKey && !apiKey.trim()} onClick={() => void save()}>保存设置</Button></Group>
      </>}
    </Stack>
  </Modal>
}
