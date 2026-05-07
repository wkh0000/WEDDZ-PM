import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import RoleGate from '@/components/RoleGate'
import AppShell from '@/components/layout/AppShell'
import NotFoundPage from '@/components/NotFoundPage'
import Spinner from '@/components/ui/Spinner'

import LoginPage from '@/features/auth/pages/LoginPage'
import SignupPage from '@/features/auth/pages/SignupPage'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import AccountPage from '@/features/auth/pages/AccountPage'
import UsersListPage from '@/features/admin/pages/UsersListPage'
import BackupsPage from '@/features/admin/pages/BackupsPage'
import CustomersListPage from '@/features/customers/pages/CustomersListPage'
import CustomerDetailPage from '@/features/customers/pages/CustomerDetailPage'
import ProjectsListPage from '@/features/projects/pages/ProjectsListPage'
import ProjectDetailPage from '@/features/projects/pages/ProjectDetailPage'
import InvoicesListPage from '@/features/invoices/pages/InvoicesListPage'
import InvoiceDetailPage from '@/features/invoices/pages/InvoiceDetailPage'
import InvoicePrintPage from '@/features/invoices/pages/InvoicePrintPage'
import ExpensesListPage from '@/features/expenses/pages/ExpensesListPage'
import EmployeesListPage from '@/features/employees/pages/EmployeesListPage'
import EmployeeDetailPage from '@/features/employees/pages/EmployeeDetailPage'
import SalariesPage from '@/features/employees/pages/SalariesPage'
import DashboardPage from '@/features/dashboard/pages/DashboardPage'

// Heavy pages — code-split to keep the main bundle small
const BoardPage    = lazy(() => import('@/features/tasks/pages/BoardPage'))
const InsightsPage = lazy(() => import('@/features/insights/pages/InsightsPage'))

function PageLoader() {
  return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Authenticated, inside AppShell */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/"           element={<DashboardPage />} />
        <Route path="/customers"  element={<CustomersListPage />} />
        <Route path="/customers/:slug" element={<CustomerDetailPage />} />
        <Route path="/projects"   element={<ProjectsListPage />} />
        <Route path="/projects/:slug" element={<ProjectDetailPage />} />
        <Route path="/projects/:slug/board" element={<Suspense fallback={<PageLoader />}><BoardPage /></Suspense>} />
        <Route path="/invoices"   element={<InvoicesListPage />} />
        <Route path="/invoices/:invoiceNo" element={<InvoiceDetailPage />} />
        <Route path="/invoices/:invoiceNo/print" element={<InvoicePrintPage />} />
        <Route path="/expenses"   element={<ExpensesListPage />} />

        {/* Super-admin only */}
        <Route path="/employees"      element={<RoleGate><EmployeesListPage /></RoleGate>} />
        <Route path="/employees/:slug" element={<RoleGate><EmployeeDetailPage /></RoleGate>} />
        <Route path="/salaries"       element={<RoleGate><SalariesPage /></RoleGate>} />

        <Route path="/insights" element={<Suspense fallback={<PageLoader />}><InsightsPage /></Suspense>} />

        <Route path="/admin/users"   element={<RoleGate><UsersListPage /></RoleGate>} />
        <Route path="/admin/backups" element={<RoleGate><BackupsPage /></RoleGate>} />
        <Route path="/account"     element={<AccountPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
