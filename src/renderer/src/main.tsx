import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import App from './App'
import { theme } from './theme'

// Mantine css 必须在 App 渲染前 import。
// ColorSchemeScript 放 head 防闪烁（这里放 body 末尾也行，因为不是 SSR）。
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ModalsProvider>
        <Notifications position="top-right" />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </React.StrictMode>
)
