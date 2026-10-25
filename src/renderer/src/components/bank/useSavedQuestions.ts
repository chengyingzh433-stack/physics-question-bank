import { useEffect, useState } from 'react'
import type { EditableQuestionDTO } from '@shared/editable'
import { ocrErrorMessage } from '../editor/ocrMessages'

/** Only the visible page and the currently enlarged card are loaded. No user data is modified. */
export function useSavedQuestions(ids: number[], refresh: number) {
  const key = JSON.stringify([...new Set(ids)])
  const [details, setDetails] = useState<Record<number, EditableQuestionDTO>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})
  useEffect(() => {
    let active = true
    const current = JSON.parse(key) as number[]
    setDetails({}); setErrors({})
    Promise.allSettled(current.map((id) => window.api.getEditableQuestion(id))).then((results) => {
      if (!active) return
      const next: Record<number, EditableQuestionDTO> = {}, failures: Record<number, string> = {}
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[current[index]] = result.value
        else failures[current[index]] = ocrErrorMessage(result.reason)
      })
      setDetails(next); setErrors(failures)
    })
    return () => { active = false }
  }, [key, refresh])
  return { details, errors }
}
