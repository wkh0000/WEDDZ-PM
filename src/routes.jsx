import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import RoleGate from '@/components/RoleGate'
import AppShell from '@/components/layout/AppShell'
import ComingSoon from '@/components/ComingSoon'
import NotFoundPage from '@/components/NotFoundPage'

import LoginPage from '@/features/auth/pages/LoginPage'
import SignupPage from '@/features/auth/pages/SignupPage'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import UsersListPage from '@/features/admin/pages/UsersListPage'
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
import BoardPage from '@/features/tasks/pages/BoardPage'
import DashboardPage from '@/features/dashboard/pages/DashboardPage'
import InsightsPage from '@/features/insights/pages/InsightsPage'

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
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/projects"   element={<ProjectsListPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/board" element={<BoardPage />} />
        <Route path="/invoices"   element={<InvoicesListPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/invoices/:id/print" element={<InvoicePrintPage />} />
        <Route path="/expenses"   element={<ExpensesListPage />} />

        {/* Super-admin only */}
        <Route path="/employees"      element={<RoleGate><EmployeesListPage /></RoleGate>} />
        <Route path="/employees/:id"  element={<RoleGate><EmployeeDetailPage /></RoleGate>} />
        <Route path="/salaries"       element={<RoleGate><SalariesPage /></RoleGate>} />

        <Route path="/insights" element={<InsightsPage />} />

        <Route path="/admin/users" element={<RoleGate><UsersListPage /></RoleGate>} />
        <Route path="/account"     element={<ComingSoon title="Account" phase="13" description="Edit your profile and change your password." />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
