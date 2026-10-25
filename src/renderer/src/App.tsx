import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { LibraryLayout } from './components/AppLayout/LibraryLayout'
import { WorkflowLayout } from './components/AppLayout/WorkflowLayout'
import IntakeView from './views/IntakeView'
import HomeView from './views/HomeView'
import CropView from './views/CropView'
import PostProcessView from './views/PostProcessView'
import PaperReviewView from './views/PaperReviewView'
import TemplateView from './views/TemplateView'
import BankView from './views/BankView'
import BasketView from './views/BasketView'
import QuestionEditorView from './views/QuestionEditorView'

import AnswerMatchView from './views/AnswerMatchView'
import ErrorBoundary from './components/ErrorBoundary'

function App(): React.JSX.Element {
  // 文件拖放不能触发 Chromium 的默认导航，否则会离开题库界面。
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    document.addEventListener('dragover', preventFileNavigation)
    document.addEventListener('drop', preventFileNavigation)
    return () => {
      document.removeEventListener('dragover', preventFileNavigation)
      document.removeEventListener('drop', preventFileNavigation)
    }
  }, [])
  return (
    <HashRouter>
      <Routes>
        <Route path="/questions/:questionId/edit" element={<ErrorBoundary><QuestionEditorView /></ErrorBoundary>} />
        {/* 库区:常驻侧边导航 */}
        <Route element={<LibraryLayout />}>
          <Route path="/" element={<ErrorBoundary><HomeView /></ErrorBoundary>} />
          <Route path="/intake" element={<ErrorBoundary><IntakeView /></ErrorBoundary>} />
          <Route path="/intake/:draftId" element={<ErrorBoundary><IntakeView /></ErrorBoundary>} />
          <Route path="/templates" element={<ErrorBoundary><TemplateView /></ErrorBoundary>} />
          <Route path="/bank" element={<ErrorBoundary><BankView /></ErrorBoundary>} />
          <Route path="/basket" element={<ErrorBoundary><BasketView /></ErrorBoundary>} />
        </Route>

        {/* 工作流区:全屏专注+步骤指示 */}
        {/* 每个视图各包一层 ErrorBoundary：单页渲染异常只毁那一页，
            不再整棵树卸载成白屏（且能看到错误信息 + 回主页）。 */}
        <Route element={<WorkflowLayout />}>
          <Route path="/crop/:paperId" element={<ErrorBoundary><CropView /></ErrorBoundary>} />
          <Route path="/post/:paperId" element={<ErrorBoundary><PostProcessView /></ErrorBoundary>} />
          <Route path="/review/:paperId" element={<ErrorBoundary><PaperReviewView /></ErrorBoundary>} />
          <Route path="/answer/:paperId" element={<ErrorBoundary><AnswerMatchView /></ErrorBoundary>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
