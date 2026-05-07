// supabase/functions/chat-assistant/index.ts
//
// In-app AI assistant. Authenticated end-users (any role) can invoke it. The
// Edge Function impersonates the user via their JWT — all RLS + role checks
// continue to apply server-side, so a "member" can't accidentally elevate.
//
// Loop:
//   1. Receive messages + optional confirmed_action
//   2. If confirmed_action → execute it as a tool call, then continue with model
//   3. Call Gemini with conversation + tool definitions
//   4. If Gemini returns text → return as assistant message
//   5. If Gemini returns function call:
//        - If tool is unsafe → return pending_action for UI confirmation
//        - If tool is safe → execute, append result, loop back to Gemini
//   6. Cap at MAX_STEPS to prevent runaway

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MODEL = 'gemini-2.5-flash'
const MAX_STEPS = 6

// -------- TOOL TYPE -----------------------------------------------------------
type ToolCtx = {
  user: { id: string; email: string }
  profile: { role: 'super_admin' | 'member'; full_name: string | null; active: boolean }
  sb: SupabaseClient   // user-scoped client (RLS-enforced)
  admin: SupabaseClient // service-role client (RLS bypass — used carefully)
}
type Tool = {
  name: string
  description: string
  parameters: any
  unsafe?: boolean                     // requires confirm-then-execute
  superAdminOnly?: boolean
  summarize?: (args: any, result?: any) => string
  handler: (args: any, ctx: ToolCtx) => Promise<unknown>
}

// -------- HELPER FOR FK LOOKUPS ----------------------------------------------
async function findCustomerId(sb: SupabaseClient, name: string) {
  const { data } = await sb.from('customers').select('id, name').ilike('name', `%${name}%`).limit(2)
  if (!data || data.length === 0) throw new Error(`No customer matching "${name}"`)
  if (data.length > 1) throw new Error(`Multiple customers match "${name}": ${data.map((c: any) => c.name).join(', ')}`)
  return data[0].id
}
async function findProjectId(sb: SupabaseClient, name: string) {
  const { data } = await sb.from('projects').select('id, name').ilike('name', `%${name}%`).limit(2)
  if (!data || data.length === 0) throw new Error(`No project matching "${name}"`)
  if (data.length > 1) throw new Error(`Multiple projects match "${name}": ${data.map((p: any) => p.name).join(', ')}`)
  return data[0].id
}
async function findEmployeeId(sb: SupabaseClient, name: string) {
  const { data } = await sb.from('employees').select('id, full_name').ilike('full_name', `%${name}%`).limit(2)
  if (!data || data.length === 0) throw new Error(`No employee matching "${name}"`)
  if (data.length > 1) throw new Error(`Multiple employees match "${name}": ${data.map((e: any) => e.full_name).join(', ')}`)
  return data[0].id
}
async function findInvoiceByNo(sb: SupabaseClient, no: string) {
  const { data } = await sb.from('invoices').select('*').ilike('invoice_no', no.toUpperCase()).single()
  if (!data) throw new Error(`Invoice ${no} not found`)
  return data
}
async function findColumnId(sb: SupabaseClient, projectId: string, name?: string) {
  const { data } = await sb.from('task_columns').select('id, name, position').eq('project_id', projectId).order('position')
  if (!data?.length) throw new Error('No columns on this project — create some first')
  if (!name) return data[0].id
  const match = data.find((c: any) => c.name.toLowerCase() === name.toLowerCase())
  if (!match) throw new Error(`Column "${name}" not found. Available: ${data.map((c: any) => c.name).join(', ')}`)
  return match.id
}
async function findProfileByEmail(sb: SupabaseClient, email: string) {
  const { data } = await sb.from('profiles').select('*').eq('email', email).single()
  if (!data) throw new Error(`No team member with email "${email}"`)
  return data
}

const FILLER_TOKENS = new Set(['team','member','user','account','the','a','an','login','people','staff'])

/**
 * Find a team member (profile) by email, full_name, or fuzzy tokens.
 * Handles prompts like "test team member" → falls back to ["test"] and
 * matches "Test Member" via ILIKE on full_name.
 */
async function findTeamMember(sb: SupabaseClient, query: string) {
  // 1. Exact email
  const { data: byEmail } = await sb.from('profiles')
    .select('id, full_name, email').eq('email', query).maybeSingle()
  if (byEmail) return byEmail

  // 2. Exact full_name (case-insensitive)
  const { data: byName } = await sb.from('profiles')
    .select('id, full_name, email').ilike('full_name', query).maybeSingle()
  if (byName) return byName

  // 3. Tokenize. Strip filler words; need ≥1 real token of ≥3 chars.
  const tokens = query.toLowerCase()
    .split(/[\s.,()]+/).filter(w => w.length >= 3 && !FILLER_TOKENS.has(w))
  if (tokens.length === 0) throw new Error(`Couldn't extract a name from "${query}"`)

  const orClause = tokens
    .flatMap(t => [`full_name.ilike.%${t}%`, `email.ilike.%${t}%`])
    .join(',')
  const { data: matches } = await sb.from('profiles')
    .select('id, full_name, email').or(orClause).limit(8)
  if (!matches?.length) throw new Error(`No team member matching "${query}"`)

  // Score by number of token hits across name + email
  const scored = matches.map((m: any) => ({
    ...m,
    score: tokens.reduce((s, t) => s
      + ((m.full_name?.toLowerCase().includes(t) ? 1 : 0)
       + (m.email?.toLowerCase().includes(t)     ? 1 : 0)), 0)
  })).sort((a: any, b: any) => b.score - a.score)

  if (scored.length === 1 || scored[0].score > scored[1].score) return scored[0]
  throw new Error(`Multiple team members match "${query}": ${
    scored.filter((s: any) => s.score === scored[0].score)
      .map((m: any) => `${m.full_name} (${m.email})`).join(', ')
  }`)
}

// -------- TOOL DEFINITIONS ----------------------------------------------------
const TOOLS: Tool[] = [
  // ---------- READ ----------
  {
    name: 'list_customers',
    description: 'List customers. Optional case-insensitive search across name + company.',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    summarize: (_args, result: any) => `Listed ${result?.length ?? 0} customers`,
    handler: async ({ query }, { sb }) => {
      let q = sb.from('customers').select('id,name,company,email,phone,created_at').order('created_at', { ascending: false }).limit(50)
      if (query) q = q.or(`name.ilike.%${query}%,company.ilike.%${query}%`)
      const { data, error } = await q
      if (error) throw error
      return data
    }
  },
  {
    name: 'list_projects',
    description: 'List projects. Optional status filter.',
    parameters: { type: 'object', properties: { status: { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'] } } },
    summarize: (_args, result: any) => `Listed ${result?.length ?? 0} projects`,
    handler: async ({ status }, { sb }) => {
      let q = sb.from('projects').select('id,name,status,budget,start_date,end_date,customer:customers(name,company)').order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return data
    }
  },
  {
    name: 'list_invoices',
    description: 'List invoices. Optional status filter.',
    parameters: { type: 'object', properties: { status: { type: 'string', enum: ['draft','sent','paid','overdue','cancelled'] } } },
    summarize: (_args, result: any) => `Listed ${result?.length ?? 0} invoices`,
    handler: async ({ status }, { sb }) => {
      let q = sb.from('invoices').select('id,invoice_no,status,total,issue_date,due_date,paid_at,customer:customers(name)').order('issue_date', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return data
    }
  },
  {
    name: 'list_expenses',
    description: 'List expenses, most-recent first. Optional category filter and month (YYYY-MM).',
    parameters: { type: 'object', properties: { category: { type: 'string' }, month: { type: 'string', description: 'YYYY-MM' } } },
    summarize: (_args, result: any) => `Listed ${result?.length ?? 0} expenses`,
    handler: async ({ category, month }, { sb }) => {
      let q = sb.from('expenses').select('id,description,amount,category,expense_date,project:projects(name)').order('expense_date', { ascending: false }).limit(50)
      if (category) q = q.eq('category', category)
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const [y, m] = month.split('-').map(Number)
        const from = `${y}-${String(m).padStart(2, '0')}-01`
        const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
        q = q.gte('expense_date', from).lt('expense_date', to)
      }
      const { data, error } = await q
      if (error) throw error
      return data
    }
  },
  {
    name: 'list_tasks',
    description: 'List tasks for a project (by name).',
    parameters: { type: 'object', properties: { project_name: { type: 'string' } }, required: ['project_name'] },
    summarize: (_args, result: any) => `Listed ${result?.length ?? 0} tasks`,
    handler: async ({ project_name }, { sb }) => {
      const projectId = await findProjectId(sb, project_name)
      const { data, error } = await sb
        .from('tasks').select('id,title,priority,due_date,column_id,assignee:profiles(full_name)')
        .eq('project_id', projectId).order('position')
      if (error) throw error
      return data
    }
  },
  {
    name: 'list_employees',
    description: 'List all employees. Super-admin only.',
    parameters: { type: 'object', properties: {} },
    superAdminOnly: true,
    summarize: (_args, result: any) => `Listed ${result?.length ?? 0} employees`,
    handler: async (_args, { sb }) => {
      const { data, error } = await sb.from('employees').select('id,full_name,role,employment_type,base_salary,joined_on,active').order('full_name')
      if (error) throw error
      return data
    }
  },
  {
    name: 'list_team_members',
    description: 'List system users (profiles) with their roles. Super-admin only.',
    parameters: { type: 'object', properties: {} },
    superAdminOnly: true,
    summarize: (_args, result: any) => `Listed ${result?.length ?? 0} team members`,
    handler: async (_args, { sb }) => {
      const { data, error } = await sb.from('profiles').select('id,email,full_name,role,active,created_at').order('created_at')
      if (error) throw error
      return data
    }
  },
  {
    name: 'dashboard_summary',
    description: 'Headline numbers: total customers, active projects, unpaid invoice total, this month expenses.',
    parameters: { type: 'object', properties: {} },
    summarize: () => 'Dashboard summary',
    handler: async (_args, { sb }) => {
      const now = new Date()
      const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
      const [c, p, i, e] = await Promise.all([
        sb.from('customers').select('*', { count: 'exact', head: true }),
        sb.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('invoices').select('total').in('status', ['sent', 'overdue']),
        sb.from('expenses').select('amount').gte('expense_date', monthStart)
      ])
      const unpaidTotal = (i.data || []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)
      const monthlyExpenses = (e.data || []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
      return {
        customers: c.count ?? 0,
        active_projects: p.count ?? 0,
        unpaid_invoices_total: unpaidTotal,
        monthly_expenses: monthlyExpenses
      }
    }
  },

  // ---------- WRITE — SAFE ----------
  {
    name: 'create_customer',
    description: 'Create a customer.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' }, company: { type: 'string' },
        email: { type: 'string' }, phone: { type: 'string' },
        address: { type: 'string' }, notes: { type: 'string' }
      },
      required: ['name']
    },
    summarize: (args) => `Added customer "${args.name}"`,
    handler: async (args, { sb, user }) => {
      const { data, error } = await sb.from('customers').insert({ ...args, created_by: user.id }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'create_project',
    description: 'Create a project. customer_name is fuzzy-matched. Default 4 kanban columns are auto-created.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        customer_name: { type: 'string' },
        status: { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'] },
        budget: { type: 'number' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date:   { type: 'string', description: 'YYYY-MM-DD' },
        description: { type: 'string' }
      },
      required: ['name']
    },
    summarize: (args) => `Created project "${args.name}"`,
    handler: async (args, { sb, user }) => {
      const customer_id = args.customer_name ? await findCustomerId(sb, args.customer_name) : null
      const { data: project, error } = await sb.from('projects').insert({
        name: args.name, customer_id,
        status: args.status ?? 'planning',
        budget: args.budget ?? 0,
        start_date: args.start_date ?? null,
        end_date: args.end_date ?? null,
        description: args.description ?? null,
        created_by: user.id
      }).select().single()
      if (error) throw error
      // Default columns
      const cols = ['To Do', 'In Progress', 'In Review', 'Done'].map((name, position) =>
        ({ project_id: project.id, name, position, created_by: user.id }))
      await sb.from('task_columns').insert(cols)
      return project
    }
  },
  {
    name: 'create_task',
    description: 'Create a task on a project board.',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        title: { type: 'string' },
        column_name: { type: 'string', description: 'Default: first column (usually "To Do")' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low','medium','high','urgent'] },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        assignee_email: { type: 'string' }
      },
      required: ['project_name', 'title']
    },
    summarize: (args) => `Added task "${args.title}" to ${args.project_name}`,
    handler: async (args, { sb, user }) => {
      const projectId = await findProjectId(sb, args.project_name)
      const columnId = await findColumnId(sb, projectId, args.column_name)
      let assignee_id = null
      if (args.assignee_email) {
        const p = await findProfileByEmail(sb, args.assignee_email)
        assignee_id = p.id
      }
      const { count } = await sb.from('tasks').select('*', { count: 'exact', head: true }).eq('column_id', columnId)
      const { data, error } = await sb.from('tasks').insert({
        project_id: projectId, column_id: columnId, title: args.title,
        description: args.description ?? null,
        priority: args.priority ?? 'medium',
        due_date: args.due_date ?? null,
        assignee_id, position: count ?? 0,
        created_by: user.id
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'add_project_update',
    description: 'Append an update to a project\'s timeline.',
    parameters: {
      type: 'object',
      properties: { project_name: { type: 'string' }, body: { type: 'string' } },
      required: ['project_name', 'body']
    },
    summarize: (args) => `Posted update on ${args.project_name}`,
    handler: async (args, { sb, user }) => {
      const projectId = await findProjectId(sb, args.project_name)
      const { data, error } = await sb.from('project_updates').insert({
        project_id: projectId, body: args.body, created_by: user.id
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'create_expense',
    description: 'Record a new expense. Leave project_name out for a general (non-project) expense.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        amount: { type: 'number' },
        category: { type: 'string', enum: ['Software','Hardware','Travel','Subcontractor','Marketing','Salary','Other'] },
        expense_date: { type: 'string', description: 'YYYY-MM-DD; default today' },
        project_name: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['description', 'amount', 'category']
    },
    summarize: (args) => `Recorded expense LKR ${args.amount} for "${args.description}"`,
    handler: async (args, { sb, user }) => {
      const project_id = args.project_name ? await findProjectId(sb, args.project_name) : null
      const { data, error } = await sb.from('expenses').insert({
        description: args.description, amount: args.amount, category: args.category,
        expense_date: args.expense_date ?? new Date().toISOString().slice(0, 10),
        project_id, notes: args.notes ?? null, created_by: user.id
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'create_invoice',
    description: 'Create an invoice as draft. Customer is fuzzy-matched. Items array of {description, quantity, unit_price}.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        project_name: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: {
          description: { type: 'string' }, quantity: { type: 'number' }, unit_price: { type: 'number' }
        }, required: ['description','unit_price'] } },
        issue_date: { type: 'string' },
        due_date: { type: 'string' },
        tax_rate: { type: 'number' },
        notes: { type: 'string' }
      },
      required: ['customer_name', 'items']
    },
    summarize: (args) => `Drafted invoice for ${args.customer_name}`,
    handler: async (args, { sb, user }) => {
      const customer_id = await findCustomerId(sb, args.customer_name)
      const project_id = args.project_name ? await findProjectId(sb, args.project_name) : null
      const { data: invoice_no, error: rpcErr } = await sb.rpc('next_invoice_number')
      if (rpcErr) throw rpcErr
      const items = (args.items || []).map((it: any) => ({
        ...it, quantity: Number(it.quantity ?? 1), unit_price: Number(it.unit_price ?? 0),
        amount: Number(it.quantity ?? 1) * Number(it.unit_price ?? 0)
      }))
      const subtotal = items.reduce((s: number, it: any) => s + it.amount, 0)
      const tax_rate = Number(args.tax_rate ?? 0)
      const tax_amount = +(subtotal * tax_rate / 100).toFixed(2)
      const total = subtotal + tax_amount
      const { data: created, error } = await sb.from('invoices').insert({
        invoice_no, customer_id, project_id,
        issue_date: args.issue_date ?? new Date().toISOString().slice(0, 10),
        due_date: args.due_date ?? null,
        status: 'draft', tax_rate, tax_amount, subtotal, total,
        notes: args.notes ?? null, created_by: user.id
      }).select().single()
      if (error) throw error
      const itemRows = items.map((it: any, i: number) => ({ invoice_id: created.id, ...it, position: i }))
      if (itemRows.length) await sb.from('invoice_items').insert(itemRows)
      return created
    }
  },

  // ---------- WRITE — UNSAFE (require confirmation) ----------
  {
    name: 'mark_invoice_paid',
    description: 'Mark an invoice as paid by invoice number (e.g. "INV-0001").',
    parameters: { type: 'object', properties: { invoice_no: { type: 'string' } }, required: ['invoice_no'] },
    unsafe: true,
    summarize: (args) => `mark ${args.invoice_no} as paid`,
    handler: async (args, { sb }) => {
      const inv = await findInvoiceByNo(sb, args.invoice_no)
      const { data, error } = await sb.from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', inv.id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'set_project_status',
    description: 'Change a project\'s status.',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        status: { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'] }
      },
      required: ['project_name', 'status']
    },
    unsafe: true,
    summarize: (args) => `set "${args.project_name}" status to ${args.status}`,
    handler: async (args, { sb }) => {
      const id = await findProjectId(sb, args.project_name)
      const { data, error } = await sb.from('projects').update({ status: args.status }).eq('id', id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'pay_salary',
    description: 'Mark a salary as paid. Auto-creates the matching expense row. Super-admin only.',
    parameters: {
      type: 'object',
      properties: {
        employee_name: { type: 'string' },
        year: { type: 'number' }, month: { type: 'number' }
      },
      required: ['employee_name', 'year', 'month']
    },
    unsafe: true, superAdminOnly: true,
    summarize: (args) => `pay ${args.employee_name} for ${args.year}-${String(args.month).padStart(2,'0')}`,
    handler: async (args, { sb }) => {
      const employee_id = await findEmployeeId(sb, args.employee_name)
      const { data: sal } = await sb.from('salaries').select('id').eq('employee_id', employee_id)
        .eq('period_year', args.year).eq('period_month', args.month).single()
      if (!sal) throw new Error('Salary record not found')
      const { error } = await sb.rpc('pay_salary', { p_salary_id: sal.id })
      if (error) throw error
      return { paid: true, salary_id: sal.id }
    }
  },
  {
    name: 'set_profile_role',
    description: 'Change a team member\'s role. Super-admin only.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        role: { type: 'string', enum: ['super_admin','member'] }
      },
      required: ['email', 'role']
    },
    unsafe: true, superAdminOnly: true,
    summarize: (args) => `change ${args.email} role to ${args.role}`,
    handler: async (args, { sb }) => {
      const p = await findProfileByEmail(sb, args.email)
      const { data, error } = await sb.from('profiles').update({ role: args.role }).eq('id', p.id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'delete_record',
    description:
`Delete one record. Provide EITHER \`id\` (UUID) OR \`name\` — the lookup is automatic.

Important entity distinction:
  • team_member  = a login user (profiles row).  Lookup by email or full name.
  • employee     = an HR record (employees row). Different table.
  • A person can be one, both, or neither.

For task: name = task title. For invoice: name = invoice_no like "INV-0001".
For expense: name = description (substring match).`,
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          enum: ['customer','project','task','invoice','expense','employee','team_member']
        },
        id:   { type: 'string', description: 'UUID. Provide id OR name.' },
        name: { type: 'string', description: 'Human-friendly identifier — looked up automatically.' }
      },
      required: ['entity']
    },
    unsafe: true,
    summarize: (args) => `delete ${args.entity} "${args.name ?? (args.id ? args.id.slice(0,8)+'…' : '?')}"`,
    handler: async ({ entity, id, name }, { sb, admin, profile }) => {
      // Resolve name -> id
      if (!id && name) {
        if (entity === 'customer')      id = await findCustomerId(sb, name)
        else if (entity === 'project')  id = await findProjectId(sb, name)
        else if (entity === 'employee') id = await findEmployeeId(sb, name)
        else if (entity === 'invoice')  { const inv = await findInvoiceByNo(sb, name); id = inv.id }
        else if (entity === 'task') {
          const { data } = await sb.from('tasks').select('id, title').ilike('title', `%${name}%`).limit(2)
          if (!data?.length)   throw new Error(`No task matching "${name}"`)
          if (data.length > 1) throw new Error(`Multiple tasks match "${name}": ${data.map((t: any) => t.title).join(', ')}`)
          id = data[0].id
        }
        else if (entity === 'expense') {
          const { data } = await sb.from('expenses').select('id, description').ilike('description', `%${name}%`).limit(2)
          if (!data?.length)   throw new Error(`No expense matching "${name}"`)
          if (data.length > 1) throw new Error(`Multiple expenses match "${name}": ${data.map((e: any) => e.description).join(', ')}`)
          id = data[0].id
        }
        else if (entity === 'team_member') {
          const hit = await findTeamMember(sb, name)
          id = hit.id
        }
      }
      if (!id) throw new Error('Either id or name is required')

      if (entity === 'team_member') {
        if (profile.role !== 'super_admin') throw new Error('Only super_admin can remove team members')
        // Delete the auth user; the profile row cascades via the FK on auth.users.
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) throw error
        return { deleted: true, entity: 'team_member', id }
      }

      const table = ({
        customer: 'customers', project: 'projects', task: 'tasks',
        invoice: 'invoices', expense: 'expenses', employee: 'employees'
      } as Record<string, string>)[entity]
      if (!table) throw new Error('unknown entity')
      const { error } = await sb.from(table).delete().eq('id', id)
      if (error) throw error
      return { deleted: true, entity, id }
    }
  },
  {
    name: 'set_team_member_active',
    description: 'Soft-disable or re-enable a team member by email — keeps their data and history but they can no longer use admin powers. Super-admin only. Prefer this over delete_record for reversible deactivation.',
    parameters: {
      type: 'object',
      properties: {
        email:  { type: 'string' },
        active: { type: 'boolean' }
      },
      required: ['email', 'active']
    },
    unsafe: true, superAdminOnly: true,
    summarize: (args) => `${args.active ? 're-enable' : 'deactivate'} ${args.email}`,
    handler: async (args, { sb }) => {
      const p = await findProfileByEmail(sb, args.email)
      const { data, error } = await sb.from('profiles').update({ active: args.active }).eq('id', p.id).select().single()
      if (error) throw error
      return data
    }
  }
]

// -------- GEMINI CALL ---------------------------------------------------------
function toGeminiTool(t: Tool) {
  return { name: t.name, description: t.description, parameters: t.parameters }
}

async function callGemini(messages: any[], tools: Tool[], geminiKey: string) {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages,
      tools: [{ functionDeclarations: tools.map(toGeminiTool) }],
      systemInstruction: {
        role: 'system',
        parts: [{ text:
`You are the WEDDZ PM assistant. Help the user manage customers, projects, invoices, expenses, salaries, and the kanban board for the WEDDZ IT business.

Vocabulary distinction (don't confuse these — they are different tables):
- TEAM MEMBER = a login user (profiles row). Has a role (super_admin or member). When the user says "team member", "user", or refers to someone on the /admin/users page, they mean this.
- EMPLOYEE   = an HR record (employees row) with salary info. Used for payroll. A team member may or may not also be an employee.

Guidelines:
- All currency is LKR (Sri Lankan Rupees).
- When the user asks for an action, **call the tool first** — every name-accepting tool does fuzzy lookup. Only ask for clarification if the tool returns "no match" or "multiple matches".
- The user often refers to records descriptively ("the test member", "the LMS project", "the tea expense"). Pass those words straight into the tool's \`name\` argument — the lookup will resolve them. Don't ask the user to type a UUID; UUIDs are for code, not humans.
- For deletes: \`delete_record({ entity, name })\` is almost always what you want. Only fall back to asking for an ID if the tool reports ambiguity.
- Multiple tools are OK in one turn; chain them when sensible (look up first, act second).
- For risky actions (mark paid, change role, delete, pay salary, change project status) the platform will pause for user confirmation — call them anyway; the framework handles the prompt.
- Be concise. After a tool call, summarize the result in one sentence.
- Never invent IDs. Look things up by name with the list_* / get_* tools.
- If a tool returns an error, surface it plainly and offer the next step.`
        }]
      },
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
    })
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 400)}`)
  }
  return resp.json()
}

// -------- MAIN HANDLER --------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')   return json({ error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const geminiKey   = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY not set' }, 500)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const user = userData.user
  const { data: profile } = await sb.from('profiles').select('role,full_name,active').eq('id', user.id).single()
  if (!profile?.active) return json({ error: 'profile inactive' }, 403)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'invalid JSON' }, 400) }
  const incoming = (body.messages ?? []) as { role: 'user' | 'assistant'; content: string }[]
  const confirmedAction = body.confirmed_action as { tool: string; args: any } | null

  const ctx: ToolCtx = { user: { id: user.id, email: user.email! }, profile: profile as any, sb, admin }

  // Build Gemini conversation
  const conv: any[] = []
  for (const m of incoming) {
    if (m.role === 'user') conv.push({ role: 'user', parts: [{ text: m.content }] })
    else if (m.role === 'assistant' && m.content) conv.push({ role: 'model', parts: [{ text: m.content }] })
  }

  const actionsTaken: { tool: string; summary: string; result?: unknown }[] = []

  // If the previous turn produced a pending_action and the user confirmed,
  // execute it BEFORE calling the model again so the model can see the result.
  if (confirmedAction) {
    const tool = TOOLS.find(t => t.name === confirmedAction.tool)
    if (!tool) return json({ error: `Unknown tool ${confirmedAction.tool}` }, 400)
    if (tool.superAdminOnly && profile.role !== 'super_admin') return json({ error: 'forbidden' }, 403)
    try {
      const result = await tool.handler(confirmedAction.args, ctx)
      const summary = tool.summarize ? tool.summarize(confirmedAction.args, result) : `${tool.name} ok`
      actionsTaken.push({ tool: tool.name, summary, result })
      // Append a synthetic model turn + function response so Gemini can finish the thought
      conv.push({ role: 'model', parts: [{ functionCall: { name: tool.name, args: confirmedAction.args } }] })
      conv.push({ role: 'user', parts: [{ functionResponse: { name: tool.name, response: { result } } }] })
    } catch (e) {
      const msg = String((e as any)?.message ?? e)
      conv.push({ role: 'model', parts: [{ functionCall: { name: confirmedAction.tool, args: confirmedAction.args } }] })
      conv.push({ role: 'user', parts: [{ functionResponse: { name: confirmedAction.tool, response: { error: msg } } }] })
      actionsTaken.push({ tool: confirmedAction.tool, summary: `failed: ${msg}` })
    }
  }

  // Filter tools by role
  const availableTools = TOOLS.filter(t => !t.superAdminOnly || profile.role === 'super_admin')

  // Loop
  for (let step = 0; step < MAX_STEPS; step++) {
    let resp
    try {
      resp = await callGemini(conv, availableTools, geminiKey)
    } catch (e) {
      return json({ error: String((e as any)?.message ?? e) }, 502)
    }
    const cand = resp?.candidates?.[0]
    const part = cand?.content?.parts?.[0]
    if (!part) return json({ message: 'I got an empty response from the model.', actions_taken: actionsTaken })

    if (part.functionCall) {
      const { name, args } = part.functionCall
      const tool = TOOLS.find(t => t.name === name)
      if (!tool) {
        conv.push({ role: 'model', parts: [{ functionCall: { name, args } }] })
        conv.push({ role: 'user', parts: [{ functionResponse: { name, response: { error: 'unknown tool' } } }] })
        continue
      }
      if (tool.superAdminOnly && profile.role !== 'super_admin') {
        conv.push({ role: 'model', parts: [{ functionCall: { name, args } }] })
        conv.push({ role: 'user', parts: [{ functionResponse: { name, response: { error: 'super_admin only' } } }] })
        continue
      }
      if (tool.unsafe) {
        // Halt here — UI will confirm
        const summary = tool.summarize ? tool.summarize(args) : `Run ${name}`
        return json({
          message: `I'd like to ${summary}. Confirm to proceed.`,
          actions_taken: actionsTaken,
          pending_action: { tool: name, args, summary }
        })
      }
      try {
        const result = await tool.handler(args ?? {}, ctx)
        const summary = tool.summarize ? tool.summarize(args, result) : `${name} ok`
        actionsTaken.push({ tool: name, summary, result })
        conv.push({ role: 'model', parts: [{ functionCall: { name, args } }] })
        conv.push({ role: 'user', parts: [{ functionResponse: { name, response: { result } } }] })
      } catch (e) {
        const msg = String((e as any)?.message ?? e)
        actionsTaken.push({ tool: name, summary: `failed: ${msg}` })
        conv.push({ role: 'model', parts: [{ functionCall: { name, args } }] })
        conv.push({ role: 'user', parts: [{ functionResponse: { name, response: { error: msg } } }] })
      }
      continue
    }

    // Plain text response
    return json({ message: part.text ?? '', actions_taken: actionsTaken })
  }

  return json({ message: 'Hit step limit. Try a more specific request.', actions_taken: actionsTaken })
})
