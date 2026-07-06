import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomeView from './views/HomeView'
import CropView from './views/CropView'

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/crop/:paperId" element={<CropView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
