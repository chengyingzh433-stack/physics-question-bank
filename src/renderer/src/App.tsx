import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomeView from './views/HomeView'
import CropView from './views/CropView'
import PostProcessView from './views/PostProcessView'
import PaperReviewView from './views/PaperReviewView'
import TemplateView from './views/TemplateView'
import BankView from './views/BankView'
import BasketView from './views/BasketView'

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/crop/:paperId" element={<CropView />} />
        <Route path="/post/:paperId" element={<PostProcessView />} />
        <Route path="/review/:paperId" element={<PaperReviewView />} />
        <Route path="/templates" element={<TemplateView />} />
        <Route path="/bank" element={<BankView />} />
        <Route path="/basket" element={<BasketView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
