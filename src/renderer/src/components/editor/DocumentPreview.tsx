import type { EditableDocument, EditableInline, QuestionAssetDTO } from '@shared/editable'
import { assetUrl } from '@shared/editable'
import { MathContent } from './MathContent'
import './QuestionEditor.css'

function Inline({ node }: { node: EditableInline }) {
  if (node.type === 'hardBreak') return <br />
  if (node.type === 'inlineMath') return <MathContent latex={node.attrs.latex} />
  let content: React.ReactNode = node.text
  if (node.marks?.some((mark) => mark.type === 'italic')) content = <em>{content}</em>
  if (node.marks?.some((mark) => mark.type === 'bold')) content = <strong>{content}</strong>
  return <>{content}</>
}

export function DocumentPreview({ document, assets }: { document: EditableDocument; assets: QuestionAssetDTO[] }) {
  return <div className="editable-document-preview">{document.content.map((block, index) => {
    if (block.type === 'paragraph') return <p key={index}>{block.content?.map((node, child) => <Inline key={child} node={node} />) ?? <br />}</p>
    const asset = assets.find((item) => item.id === block.attrs.assetId)
    return <figure className="editable-image" key={index} style={{ textAlign: block.attrs.align }}>
      {asset ? <img src={assetUrl(asset.path)} alt={block.attrs.caption || asset.name}
        style={{ width: `${block.attrs.widthPercent}%`, maxWidth: '100%' }} /> : <span className="missing-image">图片资源缺失</span>}
      {block.attrs.caption && <figcaption>{block.attrs.caption}</figcaption>}
    </figure>
  })}</div>
}
