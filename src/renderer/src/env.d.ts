import { ElectronAPI } from '@electron-toolkit/preload'
import type { Api } from '@shared/types'

declare global {
  interface Window {
    api: Api
  }
}

export interface IElectronAPI extends ElectronAPI {}
