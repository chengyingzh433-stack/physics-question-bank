import type { IntakeDraft } from '@shared/intake'
import { assetUrl } from '@shared/editable'
import { cropPage } from './IntakePreview'
import { composeQuestion, releaseComposition } from './composeQuestion'

/** Explicit local shortcut: preserve the original and create the same draft/snapshot as the detailed flow. */
export async function prepareSingleImage(draft: IntakeDraft): Promise<IntakeDraft> {
  if (draft.sources.length !== 1 || draft.sources[0].kind !== 'image' || draft.components.length) return draft
  const source = draft.sources[0]
  const asset = await window.api.addIntakeCrop(draft.id, source.id, 1, null, await cropPage(assetUrl(source.previewPath), null))
  return window.api.saveIntakeDraft(draft.id, draft.revision, draft.title,
    [{ id: crypto.randomUUID(), role: 'stem', label: '', text: '', assetId: asset.id }])
}

export async function prepareIntakeReview(draft: IntakeDraft): Promise<IntakeDraft> {
  const composition = await composeQuestion(draft)
  try { return await window.api.prepareIntakeQuestion(draft.id, draft.revision, composition.question, composition.answer) }
  finally { releaseComposition(composition) }
}
