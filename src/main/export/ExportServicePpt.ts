import { exportRasterDocument } from './ExportRasterDocument'
import { DEFAULT_WORD_OPTIONS, type WordExportOptions } from '../../shared/editable'

export function exportBasketPptx(setId: number, title: string, answerMode: 'none' | 'append' | 'inline' = 'none', options?: WordExportOptions): Promise<string | null> {
  return exportRasterDocument('pptx', setId, { ...DEFAULT_WORD_OPTIONS, ...options, title, answerMode })
}
