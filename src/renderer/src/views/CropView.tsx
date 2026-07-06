import { useParams } from 'react-router-dom'

function CropView(): React.JSX.Element {
  const { paperId } = useParams<{ paperId: string }>()
  return (
    <div style={{ padding: 24 }}>
      <h2>裁切工作区（占位）</h2>
      <p>试卷 ID：{paperId}</p>
      <p>该页面将在 M2 实现查看器、分列、横切、派生片段。</p>
    </div>
  )
}

export default CropView
