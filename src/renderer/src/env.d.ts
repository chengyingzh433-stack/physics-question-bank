import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    api: unknown
  }
}

export interface IElectronAPI extends ElectronAPI {}
