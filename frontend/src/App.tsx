import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import AuthGuard      from './components/AuthGuard'
import NovaHeader     from './components/NovaHeader'
import Dashboard      from './pages/Dashboard'
import Scripts        from './pages/Scripts'
import Episodes       from './pages/Episodes'
import AudioAndClips  from './pages/AudioAndClips'
import Scheduler      from './pages/Scheduler'
import AccountSettings from './pages/AccountSettings'
import Settings       from './pages/Settings'
import Studio         from './pages/Studio'
import Record         from './pages/Record'
import Voice          from './pages/Voice'
import CanvaCallback  from './pages/CanvaCallback'
import Login          from './pages/Login'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public routes — no auth required */}
          <Route path="/login" element={<Login />} />
          <Route path="/canva-callback" element={<CanvaCallback />} />
          
          {/* Protected routes — auth required */}
          <Route path="*" element={
            <AuthGuard>
              <NovaHeader />
              <main className="max-w-7xl mx-auto px-6 pt-20 pb-12">
                <ErrorBoundary>
                  <Routes>
                    <Route path="/"         element={<Dashboard />} />
                    <Route path="/scripts"  element={<Scripts />} />
                    <Route path="/episodes" element={<Episodes />} />
                    <Route path="/audio-clips" element={<AudioAndClips />} />
                    <Route path="/scheduler" element={<Scheduler />} />
                    <Route path="/account"  element={<AccountSettings />} />
                    <Route path="/studio"   element={<Studio />} />
                    <Route path="/voice"    element={<Voice />} />
                    <Route path="/record"   element={<Record />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </ErrorBoundary>
              </main>
            </AuthGuard>
          } />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
