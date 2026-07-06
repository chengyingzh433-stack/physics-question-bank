import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PaperDTO } from '@shared/types'
import { importPagesFromPdf } from '../services/ImportService'

const STATUS_LABEL: Record<string, string> = {
  importing: '导入中',
  cropping: '裁切中',
  processing: '后期处理',
  done: '已入库'
}

function HomeView(): React.JSX.Element {
  const [papers, setPapers] = useState<PaperDTO[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    try {
      setPapers(await window.api.listPapers())
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleImport = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      // 名字留空，主进程用文件名作为试卷名
      const paper = await window.api.importPaper('')
      if (!paper) return // 用户取消选择
      await importPagesFromPdf(paper)
      await refresh()
    } catch (e) {
      setError('导入失败：' + String(e))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const handleOpen = useCallback(
    (id: number) => {
      navigate(`/crop/${id}`)
    },
    [navigate]
  )

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>物理教师题库管理系统</h1>
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleImport} disabled={busy}>
          {busy ? '导入中…' : '导入试卷 PDF'}
        </button>
      </div>
      {error && (
        <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>
      )}
      {papers.length === 0 && !busy && <div>还没有试卷，点击上方按钮导入。</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {papers.map((p) => (
          <div
            key={p.id}
            onClick={() => handleOpen(p.id)}
            style={{
              width: 220,
              padding: 12,
              border: '1px solid #ccc',
              borderRadius: 8,
              cursor: 'pointer',
              background: '#fafafa'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: '#555' }}>
              {p.page_count} 页 · {STATUS_LABEL[p.status] ?? p.status}
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {p.created_at ? new Date(p.created_at).toLocaleString() : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HomeView
