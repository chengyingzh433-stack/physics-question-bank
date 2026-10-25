export type UpdatePhase = 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'installing' | 'error'

export interface UpdatePreferences {
  autoCheck: boolean
  includePrerelease: boolean
}

export interface UpdateRelease {
  version: string
  name: string
  notes: string
  publishedAt: string
  pageUrl: string
  prerelease: boolean
  assetName: string | null
  assetSize: number | null
}

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  platform: string
  arch: string
  packaged: boolean
  preferences: UpdatePreferences
  release: UpdateRelease | null
  checkedAt: string | null
  downloadedBytes: number
  totalBytes: number
  message: string | null
}

export interface UpdateApi {
  getUpdateState(): Promise<UpdateState>
  saveUpdatePreferences(value: UpdatePreferences): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  cancelUpdateDownload(): Promise<UpdateState>
  installUpdate(): Promise<UpdateState>
  openUpdateRelease(): Promise<void>
}
