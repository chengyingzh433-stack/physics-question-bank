import { exportRasterDocument } from './ExportRasterDocument'
import { DEFAULT_WORD_OPTIONS, type WordExportOptions } from '../../shared/editable'
export { exportBasketPptx } from './ExportServicePpt'

export function exportBasketPdf(setId: number, title: string, answerMode: 'none' | 'append' | 'inline' = 'none', options?: WordExportOptions): Promise<string | null> {
  return exportRasterDocument('pdf', setId, { ...DEFAULT_WORD_OPTIONS, ...options, title, answerMode })
}
