import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout.tsx'
import { Dashboard } from './pages/Dashboard.tsx'
import { Deployments } from './pages/Deployments.tsx'
import { Environments } from './pages/Environments.tsx'
import { FlakyTests } from './pages/FlakyTests.tsx'
import { RunDetailPage } from './pages/RunDetail.tsx'
import { Runs } from './pages/Runs.tsx'
import { ServiceDetail } from './pages/ServiceDetail.tsx'
import { Services } from './pages/Services.tsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/deployments" element={<Deployments />} />
        <Route path="/environments" element={<Environments />} />
        <Route path="/flaky-tests" element={<FlakyTests />} />
        <Route path="*" element={<div className="card">Page not found.</div>} />
      </Routes>
    </Layout>
  )
}
