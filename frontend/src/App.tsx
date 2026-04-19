import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthGuard      from './components/AuthGuard'
import NovaHeader     from './components/NovaHeader'
import Dashboard      from './pages/Dashboard'
import Scripts        from './pages/Scripts'
import Episodes       from './pages/Episodes'
import Settings       from './pages/Settings'
import SPHPipeline    from './pages/SPHPipeline'
import Studio         from './pages/Studio'
import Record         from './pages/Record'
import Voice          from './pages/Voice'
import CanvaCallback  from './pages/CanvaCallback'

export default function App() {
  return (
    <BrowserRouter>
      {/* Public route — no auth */}
      <Routes>
        <Route path="/canva-callback" element={<CanvaCallback />} />
        <Route path="*" element={
          <AuthGuard>
            <NovaHeader />
            <main className="max-w-7xl mx-auto px-6 pt-20 pb-12">
              <Routes>
                <Route path="/"         element={<Dashboard />} />
                <Route path="/scripts"  element={<Scripts />} />
                <Route path="/episodes" element={<Episodes />} />
                <Route path="/studio"   element={<Studio />} />
                <Route path="/voice"    element={<Voice />} />
                <Route path="/record"   element={<Record />} />
                <Route path="/sph"      element={<SPHPipeline />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </AuthGuard>
        } />
      </Routes>
    </BrowserRouter>
  )
}
