/** IPC implementation details are not useful instructions for the teacher. */
export function ocrErrorMessage(value: unknown): string {
  return String(value).replace(/^Error:\s*/, '')
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
    .replace(/^OCR_[A-Z_]+:\s*/, '')
}
