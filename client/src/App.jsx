import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import SignInPage from './pages/SignInPage'
import DashboardPage from './pages/DashboardPage'
import InventoryPage from './pages/InventoryPage'
import ItemDetailPage from './pages/ItemDetailPage'
import POSPage from './pages/POSPage'
import PurchasesPage from './pages/PurchasesPage'
import ExpensesPage from './pages/ExpensesPage'
import ReportsPage from './pages/ReportsPage'
import AdminPage from './pages/AdminPage'
import MonthlyReportPage from './pages/MonthlyReportPage'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Loading Pets&Claws...</div>
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />
  return children
}

function PermissionRoute({ permission, children }) {
  const { can, loading } = useAuth()
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Loading Pets&Claws...</div>
  if (!can(permission)) return <Navigate to="/pos" replace />
  return children
}

export default function App() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/sign-in" element={isAuthenticated ? <Navigate to="/" replace /> : <SignInPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Navbar />
              <main className="lg:pl-64">
                <div className="max-w-7xl w-full mx-auto px-4 py-5 lg:px-6">
                <Routes>
                  <Route path="/" element={<PermissionRoute permission="dashboard"><DashboardPage /></PermissionRoute>} />
                  <Route path="/inventory" element={<PermissionRoute permission="stock"><InventoryPage /></PermissionRoute>} />
                  <Route path="/inventory/:id" element={<PermissionRoute permission="stock"><ItemDetailPage /></PermissionRoute>} />
                  <Route path="/pos" element={<PermissionRoute permission="pos"><POSPage /></PermissionRoute>} />
                  <Route path="/purchases" element={<PermissionRoute permission="purchases"><PurchasesPage /></PermissionRoute>} />
                  <Route path="/expenses" element={<PermissionRoute permission="expenses"><ExpensesPage /></PermissionRoute>} />
                  <Route path="/reports" element={<PermissionRoute permission="dashboard"><ReportsPage /></PermissionRoute>} />
                  <Route path="/admin" element={<PermissionRoute permission="admin"><AdminPage /></PermissionRoute>} />
                  <Route path="/monthly-report" element={<PermissionRoute permission="monthly_report"><MonthlyReportPage /></PermissionRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </div>
              </main>
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  )
}
