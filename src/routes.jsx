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

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Authenticated, inside AppShell */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/"           element={<ComingSoon title="Dashboard"   phase="11" description="Stat cards, recent projects, upcoming invoices." />} />
        <Route path="/customers"  element={<CustomersListPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/projects"   element={<ComingSoon title="Projects"    phase="06" description="Project list with status filter." />} />
        <Route path="/projects/:id" element={<ComingSoon title="Project"   phase="06" description="Project detail with updates, invoices, expenses." />} />
        <Route path="/projects/:id/board" element={<ComingSoon title="Kanban" phase="10" description="Drag-and-drop task board with realtime collaboration." />} />
        <Route path="/invoices"   element={<ComingSoon title="Invoices"    phase="07" description="Invoice list with auto-numbering and status filter." />} />
        <Route path="/invoices/:id" element={<ComingSoon title="Invoice"   phase="07" description="Invoice detail with line items and mark-as-paid." />} />
        <Route path="/invoices/:id/print" element={<ComingSoon title="Invoice (Print)" phase="07" description="Printable A4 invoice." />} />
        <Route path="/expenses"   element={<ComingSoon title="Expenses"    phase="08" description="Expense list with category filter and monthly summary." />} />

        {/* Super-admin only */}
        <Route path="/employees"      element={<RoleGate><ComingSoon title="Employees" phase="09" description="Employee directory and details." /></RoleGate>} />
        <Route path="/employees/:id"  element={<RoleGate><ComingSoon title="Employee"  phase="09" description="Employee detail with salary history." /></RoleGate>} />
        <Route path="/salaries"       element={<RoleGate><ComingSoon title="Salaries"  phase="09" description="Monthly salary run with mark-as-paid." /></RoleGate>} />

        <Route path="/insights" element={<ComingSoon title="Insights" phase="12" description="Revenue, profitability, trends, cash flow." />} />

        <Route path="/admin/users" element={<RoleGate><UsersListPage /></RoleGate>} />
        <Route path="/account"     element={<ComingSoon title="Account" phase="13" description="Edit your profile and change your password." />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
