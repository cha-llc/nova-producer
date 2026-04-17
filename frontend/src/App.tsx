import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthGuard from './components/AuthGuard'
import NovaHeader from './components/NovaHeader'
import Dashboard from './pages/Dashboard'
import Scripts   from './pages/Scripts'
import Episodes  from './pages/Episodes'
import Settings  from './pages/Settings'

export default function App() {
  return (
    <AuthGuard>
      <BrowserRouter>
        <NovaHeader />
        <main className="max-w-7xl mx-auto px-6 pt-20 pb-12">
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/scripts"  element={<Scripts />} />
            <Route path="/episodes" element={<Episodes />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthGuard>
  )
}
