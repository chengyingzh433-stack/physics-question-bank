import { PaperStatus } from '@shared/types'

const STATUS_META: Record<
  PaperStatus,
  { label: string; color: 'gray' | 'blue' | 'orange' | 'green' }
> = {
  importing: { label: '导入中', color: 'blue' },
  cropping: { label: '裁切中', color: 'orange' },
  processing: { label: '后期处理', color: 'orange' },
  done: { label: '已入库', color: 'green' }
}

export function statusMeta(status: PaperStatus) {
  return STATUS_META[status] ?? { label: status, color: 'gray' as const }
}
