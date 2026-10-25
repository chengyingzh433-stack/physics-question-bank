import { useEffect, useMemo, useRef, useState } from 'react'
import { ActionIcon, Alert, Button, Group, NumberInput, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core'
import { IconArrowBackUp, IconArrowForwardUp, IconBold, IconItalic, IconMathFunction, IconPhoto, IconScissors, IconTrash } from '@tabler/icons-react'
import { Node, mergeAttributes } from '@tiptap/core'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { NodeSelection } from '@tiptap/pm/state'
import { assetUrl, type EditableDocument, type ImageAlignment, type QuestionAssetDTO } from '@shared/editable'
import { FormulaDialog, MathContent } from './MathContent'
import { ImageCropDialog } from './ImageCropDialog'

interface Props {
  questionId: number; initialDocument: EditableDocument; assets: QuestionAssetDTO[]; disabled: boolean
  sources: { label: string; url: string }[]
  onChange: (value: EditableDocument) => void
  onAsset: (asset: QuestionAssetDTO) => void
  onBusy: (busy: boolean) => void
}

export function QuestionDocumentEditor({ questionId, initialDocument, assets, disabled, sources, onChange, onAsset, onBusy }: Props) {
  const assetsRef = useRef(assets); assetsRef.current = assets
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [formula, setFormula] = useState<{ from: number; to: number; latex: string } | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const insertRange = useRef({ from: 1, to: 1 })
  const [assetBusy, setAssetBusy] = useState(false)
  const [error, setError] = useState('')
  const openFormulaRef = useRef<(pos: number, latex: string) => void>(() => {})
  openFormulaRef.current = (pos, latex) => setFormula({ from: pos, to: pos + 1, latex })

  const extensions = useMemo(() => {
    const InlineMath = Node.create({
      name: 'inlineMath', group: 'inline', inline: true, atom: true, marks: '',
      addAttributes: () => ({ latex: { default: '' } }),
      parseHTML: () => [{ tag: 'span[data-question-math]', getAttrs: (element) => ({ latex: (element as HTMLElement).getAttribute('data-latex') ?? '' }) }],
      renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-question-math': '', 'data-latex': node.attrs.latex }), node.attrs.latex],
      addNodeView() {
        return ReactNodeViewRenderer(function FormulaNode({ node, getPos, selected }: NodeViewProps) {
          return <NodeViewWrapper as="span" className={`editor-math-node ${selected ? 'selected' : ''}`} contentEditable={false}
            title="双击编辑公式" onDoubleClick={() => { const pos = getPos(); if (typeof pos === 'number') openFormulaRef.current(pos, node.attrs.latex) }}>
            <MathContent latex={node.attrs.latex} />
          </NodeViewWrapper>
        })
      }
    })
    const Image = Node.create({
      name: 'image', group: 'block', atom: true, draggable: true,
      addAttributes: () => ({ assetId: { default: '' }, widthPercent: { default: 60 }, align: { default: 'center' }, caption: { default: '' } }),
      parseHTML: () => [{ tag: 'figure[data-question-image]', getAttrs: (element) => {
        const el = element as HTMLElement
        return { assetId: el.dataset.assetId ?? '', widthPercent: Number(el.dataset.widthPercent) || 60, align: el.dataset.align ?? 'center', caption: el.dataset.caption ?? '' }
      } }],
      renderHTML: ({ node }) => ['figure', { 'data-question-image': '', 'data-asset-id': node.attrs.assetId,
        'data-width-percent': node.attrs.widthPercent, 'data-align': node.attrs.align, 'data-caption': node.attrs.caption }, node.attrs.caption || '配图'],
      addNodeView() {
        return ReactNodeViewRenderer(function ImageNode({ node, selected }: NodeViewProps) {
          const asset = assetsRef.current.find((item) => item.id === node.attrs.assetId)
          return <NodeViewWrapper className={`editor-image-node ${selected ? 'selected' : ''}`} contentEditable={false} data-drag-handle>
            <figure style={{ textAlign: node.attrs.align }}>
              {asset ? <img src={assetUrl(asset.path)} alt={node.attrs.caption || asset.name} draggable={false}
                style={{ width: `${node.attrs.widthPercent}%` }} /> : <span className="missing-image">图片资源缺失</span>}
              {node.attrs.caption && <figcaption>{node.attrs.caption}</figcaption>}
            </figure>
          </NodeViewWrapper>
        })
      }
    })
    return [StarterKit.configure({ blockquote: false, bulletList: false, code: false, codeBlock: false, heading: false,
      horizontalRule: false, listItem: false, listKeymap: false, link: false, orderedList: false,
      strike: false, underline: false, trailingNode: false }), InlineMath, Image]
  }, [])
  const editor = useEditor({
    extensions, content: initialDocument, editable: !disabled,
    editorProps: {
      attributes: { 'aria-label': '可编辑题目正文', role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => {
        if (!event.clipboardData?.files.length) return false
        setError('剪贴板包含图片。请先保存图片，再使用“导入配图”；或直接从左侧原图裁取。')
        return true
      }
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.getJSON() as EditableDocument)
      setSelectionVersion((value) => value + 1)
    },
    onSelectionUpdate: () => setSelectionVersion((value) => value + 1)
  })
  useEffect(() => { editor?.setEditable(!disabled && !assetBusy) }, [editor, disabled, assetBusy])
  useEffect(() => { onBusy(assetBusy || formula != null || cropOpen) }, [assetBusy, formula != null, cropOpen, onBusy])
  useEffect(() => () => onBusy(false), [onBusy])
  // The counter subscribes this toolbar to selection and history transactions.
  void selectionVersion
  const imageSelected = editor?.isActive('image') ?? false
  const imageAttributes = editor?.getAttributes('image') ?? {}
  const busy = disabled || assetBusy
  const rememberPosition = () => { if (editor) insertRange.current = { from: editor.state.selection.from, to: editor.state.selection.to } }
  const insertAsset = (asset: QuestionAssetDTO) => {
    onAsset(asset)
    assetsRef.current = [...assetsRef.current.filter((item) => item.id !== asset.id), asset]
    editor?.chain().focus().insertContentAt(insertRange.current, [
      { type: 'image', attrs: { assetId: asset.id, widthPercent: 60, align: 'center', caption: '' } }, { type: 'paragraph' }
    ]).run()
  }
  const importImage = async () => {
    if (busy) return
    rememberPosition(); setAssetBusy(true); setError('')
    try { const asset = await window.api.importQuestionAsset(questionId); if (asset) insertAsset(asset) }
    catch (e) { setError(String(e)) }
    finally { setAssetBusy(false) }
  }
  const openFormula = () => {
    if (!editor) return
    const { selection } = editor.state
    if (selection instanceof NodeSelection && selection.node.type.name === 'inlineMath') {
      setFormula({ from: selection.from, to: selection.to, latex: selection.node.attrs.latex })
    } else setFormula({ from: selection.from, to: selection.to, latex: '' })
  }
  return <Stack gap="xs" className="document-editor">
    <Group gap={4} className="editor-toolbar" wrap="wrap">
      <Tooltip label="加粗（⌘ / Ctrl + B）"><ActionIcon aria-label="加粗" disabled={busy} variant={editor?.isActive('bold') ? 'filled' : 'subtle'}
        onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}><IconBold size={17} /></ActionIcon></Tooltip>
      <Tooltip label="斜体（⌘ / Ctrl + I）"><ActionIcon aria-label="斜体" disabled={busy} variant={editor?.isActive('italic') ? 'filled' : 'subtle'}
        onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}><IconItalic size={17} /></ActionIcon></Tooltip>
      <Tooltip label="撤销"><ActionIcon aria-label="撤销" variant="subtle" disabled={busy || !editor?.can().undo()}
        onClick={() => editor?.chain().focus().undo().run()}><IconArrowBackUp size={17} /></ActionIcon></Tooltip>
      <Tooltip label="重做"><ActionIcon aria-label="重做" variant="subtle" disabled={busy || !editor?.can().redo()}
        onClick={() => editor?.chain().focus().redo().run()}><IconArrowForwardUp size={17} /></ActionIcon></Tooltip>
      <Button size="xs" variant="light" disabled={busy} leftSection={<IconMathFunction size={15} />} onClick={openFormula}>公式</Button>
      <Button size="xs" variant="light" disabled={busy} leftSection={<IconPhoto size={15} />} onClick={() => void importImage()}>导入配图</Button>
      <Button size="xs" variant="light" disabled={busy || !sources.length} leftSection={<IconScissors size={15} />}
        onClick={() => { rememberPosition(); setCropOpen(true) }}>原图裁取</Button>
    </Group>
    {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
    {imageSelected && <Group className="image-controls" align="end" gap="sm">
      <NumberInput label="配图宽度 (%)" value={imageAttributes.widthPercent ?? 60} min={10} max={100} step={5} clampBehavior="strict" w={120} disabled={busy}
        onChange={(value) => { if (typeof value === 'number') editor?.commands.updateAttributes('image', { widthPercent: Math.max(10, Math.min(100, value)) }) }} />
      <Select label="对齐" data={[{ value: 'left', label: '居左' }, { value: 'center', label: '居中' }, { value: 'right', label: '居右' }]}
        value={imageAttributes.align ?? 'center'} w={100} allowDeselect={false} disabled={busy}
        onChange={(value) => { if (value) editor?.commands.updateAttributes('image', { align: value as ImageAlignment }) }} />
      <TextInput label="图注" value={imageAttributes.caption ?? ''} style={{ flex: 1, minWidth: 120 }} maxLength={1000} disabled={busy}
        onChange={(event) => editor?.commands.updateAttributes('image', { caption: event.currentTarget.value })} />
      <ActionIcon aria-label="删除选中配图" color="red" variant="subtle" disabled={busy}
        onClick={() => editor?.chain().focus().deleteSelection().run()}><IconTrash size={18} /></ActionIcon>
    </Group>}
    <div className={`editor-paper ${busy ? 'disabled' : ''}`}><EditorContent editor={editor} /></div>
    <Text size="xs" c="dimmed">Enter 新建段落，Shift + Enter 换行；双击公式可修改，点选图片可调整宽度、对齐和图注。</Text>
    <FormulaDialog opened={formula != null} value={formula?.latex ?? ''} onChange={(latex) => setFormula((prev) => prev ? { ...prev, latex } : prev)}
      onClose={() => setFormula(null)} onInsert={() => {
        if (!formula) return
        editor?.chain().focus().insertContentAt({ from: formula.from, to: formula.to }, { type: 'inlineMath', attrs: { latex: formula.latex.trim() } }).run()
        setFormula(null)
      }} />
    <ImageCropDialog opened={cropOpen} sources={sources} onClose={() => setCropOpen(false)} onSave={async (data, name) => {
      setAssetBusy(true)
      try { insertAsset(await window.api.saveQuestionAsset(questionId, data, name)) }
      finally { setAssetBusy(false) }
    }} />
  </Stack>
}
