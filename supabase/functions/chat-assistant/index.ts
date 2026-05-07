// supabase/functions/chat-assistant/index.ts
//
// In-app AI assistant. Authenticated end-users (any role) can invoke it. The
// Edge Function impersonates the user via their JWT — all RLS + role checks
// continue to apply server-side, so a "member" can't accidentally elevate.
//
// Backed by Groq (OpenAI-compatible API) — Llama 3.3 70B Versatile,
// free tier: 30 RPM / 14,400 RPD (vs Gemini free's 20 RPM / 250 RPD).
//
// Loop:
//   1. Receive messages + optional confirmed_action
//   2. If confirmed_action → execute it as a tool call, then continue with model
//   3. Call Groq with conversation + tool definitions
//   4. If Groq returns text → return as assistant message
//   5. If Groq returns tool_calls:
//        - If tool is unsafe → return pending_action for UI confirmation
//        - If tool is safe → execute, append result, loop back to Groq
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

// Groq (OpenAI-compatible). Llama 4 Scout is Groq's recommended tool-use
// model — Llama 3.3 70B occasionally emits its native <function=name{...}>
// syntax which Groq rejects with `tool_use_failed`. Llama 4 always emits
// the OpenAI structured tool_calls format. ~14,400 RPD free tier.
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
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

async function findTaskByTitle(sb: SupabaseClient, projectName: string | null, title: string) {
  let q = sb.from('tasks').select('id, title, project_id').ilike('title', `%${title}%`)
  if (projectName) {
    const projectId = await findProjectId(sb, projectName)
    q = q.eq('project_id', projectId)
  }
  const { data } = await q.limit(2)
  if (!data?.length) throw new Error(`No task matching "${title}"`)
  if (data.length > 1) throw new Error(`Multiple tasks match "${title}": ${data.map((t: any) => t.title).join(', ')}`)
  return data[0]
}

async function findExpense(sb: SupabaseClient, query: string) {
  const { data } = await sb.from('expenses').select('id, description, amount').ilike('description', `%${query}%`).limit(3)
  if (!data?.length) throw new Error(`No expense matching "${query}"`)
  if (data.length > 1) throw new Error(`Multiple expenses match "${query}": ${data.map((e: any) => `${e.description} (LKR ${e.amount})`).join(', ')}`)
  return data[0]
}

async function findSalary(sb: SupabaseClient, employeeName: string, year: number, month: number) {
  const empId = await findEmployeeId(sb, employeeName)
  const { data } = await sb.from('salaries').select('*')
    .eq('employee_id', empId).eq('period_year', year).eq('period_month', month).maybeSingle()
  if (!data) throw new Error(`No salary record for ${employeeName} in ${year}-${String(month).padStart(2, '0')}`)
  return data
}

async function findLabel(sb: SupabaseClient, projectName: string, labelName: string) {
  const projectId = await findProjectId(sb, projectName)
  const { data } = await sb.from('task_labels').select('id, name, color')
    .eq('project_id', projectId).ilike('name', labelName).limit(2)
  if (!data?.length) throw new Error(`No label "${labelName}" on project "${projectName}"`)
  if (data.length > 1) throw new Error(`Multiple labels match: ${data.map((l: any) => l.name).join(', ')}`)
  return { ...data[0], project_id: projectId }
}

/** Pick out only the keys with non-null values from an args object */
function compactUpdates<T extends Record<string, any>>(updates: T): Partial<T> {
  const out: any = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
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
        .from('tasks').select('id,title,priority,due_date,column_id,assignee:profiles!tasks_assignee_id_fkey(full_name)')
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

  // ---------- INSIGHTS / RAG (read, safe) ----------
  {
    name: 'get_business_overview',
    description: 'Headline financial picture for a period: revenue, expenses, net, by-category breakdown, top customer, top projects.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['this_month', 'last_month', 'last_3_months', 'ytd', 'last_12_months', 'all_time'],
          description: 'Default this_month'
        }
      }
    },
    summarize: (args, result: any) => `Overview · ${args.period ?? 'this_month'} · revenue LKR ${Math.round(result?.revenue ?? 0).toLocaleString()}`,
    handler: async ({ period = 'this_month' }, { sb }) => {
      const now = new Date()
      let from: string | null = null
      const today = now.toISOString().slice(0, 10)
      if (period === 'this_month') from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
      else if (period === 'last_month') {
        const d = new Date(now); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1)
        from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
      }
      else if (period === 'last_3_months') {
        const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 3); from = d.toISOString().slice(0, 10)
      }
      else if (period === 'ytd') from = `${now.getUTCFullYear()}-01-01`
      else if (period === 'last_12_months') {
        const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 12); from = d.toISOString().slice(0, 10)
      }
      // all_time: from = null

      // Revenue from paid invoices (use paid_at if present, else issue_date)
      let invQ = sb.from('invoices').select('total, customer:customers(name)').eq('status', 'paid')
      if (from) invQ = invQ.gte('issue_date', from)
      const { data: invoices } = await invQ
      const revenue = (invoices || []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)

      // Expenses
      let expQ = sb.from('expenses').select('amount, category, project_id, project:projects(name)')
      if (from) expQ = expQ.gte('expense_date', from)
      const { data: expenses } = await expQ
      const totalExpenses = (expenses || []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)

      const byCategory: Record<string, number> = {}
      for (const e of expenses ?? []) byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount ?? 0)

      // Top customer by paid revenue (period)
      const customerTotals: Record<string, number> = {}
      for (const i of invoices ?? []) {
        const n = i.customer?.name ?? 'Unknown'
        customerTotals[n] = (customerTotals[n] ?? 0) + Number(i.total ?? 0)
      }
      const top_customers = Object.entries(customerTotals)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, total]) => ({ name, total }))

      // Unpaid invoices summary
      const { data: unpaid } = await sb.from('invoices').select('total, status').in('status', ['sent', 'overdue'])
      const unpaid_total = (unpaid || []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)

      return {
        period,
        from: from ?? 'inception',
        to: today,
        revenue,
        expenses: totalExpenses,
        net: revenue - totalExpenses,
        invoices_in_period: invoices?.length ?? 0,
        expenses_by_category: byCategory,
        top_customers,
        unpaid_invoices_total: unpaid_total,
        unpaid_invoices_count: unpaid?.length ?? 0
      }
    }
  },
  {
    name: 'get_project_financials',
    description: 'Detailed money picture for one project: budget, paid revenue, expenses, net profit, % of budget consumed.',
    parameters: {
      type: 'object',
      properties: { project_name: { type: 'string' } },
      required: ['project_name']
    },
    summarize: (args, result: any) => `${args.project_name}: net LKR ${Math.round(result?.net ?? 0).toLocaleString()}`,
    handler: async ({ project_name }, { sb }) => {
      const projectId = await findProjectId(sb, project_name)
      const { data: project } = await sb.from('projects')
        .select('id, name, status, budget, start_date, end_date, customer:customers(name,company)')
        .eq('id', projectId).single()
      const { data: paidInvs } = await sb.from('invoices').select('total').eq('project_id', projectId).eq('status', 'paid')
      const { data: openInvs } = await sb.from('invoices').select('total').eq('project_id', projectId).in('status', ['sent', 'overdue', 'draft'])
      const { data: exps } = await sb.from('expenses').select('amount, category').eq('project_id', projectId)

      const paid_revenue = (paidInvs || []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)
      const open_revenue = (openInvs || []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)
      const total_expenses = (exps || []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
      const budget = Number(project?.budget ?? 0)

      return {
        project: project?.name,
        status: project?.status,
        customer: project?.customer ? (project.customer.company || project.customer.name) : null,
        budget,
        paid_revenue,
        open_revenue,
        total_invoiced: paid_revenue + open_revenue,
        total_expenses,
        net: paid_revenue - total_expenses,
        budget_consumed_percent: budget > 0 ? +((total_expenses / budget) * 100).toFixed(1) : null,
        revenue_vs_budget_percent: budget > 0 ? +((paid_revenue / budget) * 100).toFixed(1) : null
      }
    }
  },
  {
    name: 'get_monthly_revenue_expenses',
    description: 'Per-month revenue + expenses series for the last N months. Useful for trend questions.',
    parameters: {
      type: 'object',
      properties: { months: { type: 'number', description: 'Default 12' } }
    },
    summarize: (args, result: any) => `${result?.length ?? 0} months of revenue/expense data`,
    handler: async ({ months = 12 }, { sb }) => {
      const series: { month: string; revenue: number; expenses: number; net: number }[] = []
      const now = new Date()
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
        const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
        const fromStr = d.toISOString().slice(0, 10)
        const toStr = next.toISOString().slice(0, 10)
        const { data: invs } = await sb.from('invoices').select('total').eq('status', 'paid').gte('issue_date', fromStr).lt('issue_date', toStr)
        const { data: exps } = await sb.from('expenses').select('amount').gte('expense_date', fromStr).lt('expense_date', toStr)
        const rev = (invs || []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0)
        const exp = (exps || []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
        series.push({ month: fromStr.slice(0, 7), revenue: rev, expenses: exp, net: rev - exp })
      }
      return series
    }
  },
  {
    name: 'get_top_customers',
    description: 'Top customers by paid revenue (all-time). Default 5.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    summarize: (_args, result: any) => `Top ${result?.length ?? 0} customers`,
    handler: async ({ limit = 5 }, { sb }) => {
      const { data } = await sb.from('invoices')
        .select('total, customer:customers(name,company)').eq('status', 'paid')
      const totals: Record<string, { name: string; company: string | null; total: number; count: number }> = {}
      for (const i of data ?? []) {
        const k = i.customer?.name ?? 'Unknown'
        if (!totals[k]) totals[k] = { name: k, company: i.customer?.company ?? null, total: 0, count: 0 }
        totals[k].total += Number(i.total ?? 0)
        totals[k].count += 1
      }
      return Object.values(totals).sort((a, b) => b.total - a.total).slice(0, limit)
    }
  },
  {
    name: 'get_upcoming_invoice_due',
    description: 'Invoices with a due_date in the next N days that are not yet paid. Default 14 days.',
    parameters: { type: 'object', properties: { days: { type: 'number' } } },
    summarize: (_args, result: any) => `${result?.length ?? 0} upcoming due`,
    handler: async ({ days = 14 }, { sb }) => {
      const now = new Date()
      const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10)
      const today = now.toISOString().slice(0, 10)
      const { data } = await sb.from('invoices')
        .select('invoice_no, total, status, due_date, customer:customers(name)')
        .in('status', ['sent', 'draft', 'overdue'])
        .gte('due_date', today).lte('due_date', until).order('due_date')
      return data ?? []
    }
  },
  {
    name: 'monthly_expense_summary',
    description: 'Total expenses for a specific month, broken down by category.',
    parameters: {
      type: 'object',
      properties: { year: { type: 'number' }, month: { type: 'number' } },
      required: ['year', 'month']
    },
    summarize: (args, result: any) => `${args.year}-${String(args.month).padStart(2,'0')}: LKR ${Math.round(result?.total ?? 0).toLocaleString()}`,
    handler: async ({ year, month }, { sb }) => {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
      const { data } = await sb.from('expenses').select('amount, category')
        .gte('expense_date', from).lt('expense_date', next)
      const total = (data || []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
      const by_category: Record<string, number> = {}
      for (const e of data ?? []) by_category[e.category] = (by_category[e.category] ?? 0) + Number(e.amount ?? 0)
      return { year, month, total, count: data?.length ?? 0, by_category }
    }
  },

  // ---------- ADDITIONAL CREATES (safe) ----------
  {
    name: 'create_employee',
    description: 'Add an employee (HR record). Super-admin only. Does NOT create a login user — use add_team_member for that.',
    parameters: {
      type: 'object',
      properties: {
        full_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        role: { type: 'string', description: 'Job title (e.g. "Engineer", "Founder")' },
        employment_type: { type: 'string', enum: ['full_time', 'part_time', 'contract', 'intern'] },
        base_salary: { type: 'number' },
        joined_on: { type: 'string', description: 'YYYY-MM-DD' },
        notes: { type: 'string' }
      },
      required: ['full_name']
    },
    superAdminOnly: true,
    summarize: (args) => `Added employee "${args.full_name}"`,
    handler: async (args, { sb, user }) => {
      const { data, error } = await sb.from('employees').insert({
        full_name: args.full_name,
        email: args.email ?? null,
        phone: args.phone ?? null,
        role: args.role ?? null,
        employment_type: args.employment_type ?? 'full_time',
        base_salary: Number(args.base_salary ?? 0),
        joined_on: args.joined_on ?? null,
        active: true,
        notes: args.notes ?? null,
        created_by: user.id
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'create_salary',
    description: 'Manually create a salary record (status=pending). For automatic generation of all active employees, use generate_monthly_salaries.',
    parameters: {
      type: 'object',
      properties: {
        employee_name: { type: 'string' },
        year: { type: 'number' },
        month: { type: 'number' },
        amount: { type: 'number' },
        bonus: { type: 'number' },
        deductions: { type: 'number' },
        notes: { type: 'string' }
      },
      required: ['employee_name', 'year', 'month', 'amount']
    },
    superAdminOnly: true,
    summarize: (args) => `Salary record for ${args.employee_name} ${args.year}-${String(args.month).padStart(2,'0')}`,
    handler: async (args, { sb, user }) => {
      const empId = await findEmployeeId(sb, args.employee_name)
      const amount = Number(args.amount), bonus = Number(args.bonus ?? 0), deductions = Number(args.deductions ?? 0)
      const { data, error } = await sb.from('salaries').insert({
        employee_id: empId,
        period_year: Number(args.year), period_month: Number(args.month),
        amount, bonus, deductions, net_amount: amount + bonus - deductions,
        status: 'pending', notes: args.notes ?? null, created_by: user.id
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'add_team_member',
    description: 'Create a new login user and grant them member or super_admin access. Sends nothing automatically — share the temp password securely.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        full_name: { type: 'string' },
        role: { type: 'string', enum: ['member', 'super_admin'] },
        password: { type: 'string', description: 'Optional. If omitted, a 12-char temp password is generated and returned.' }
      },
      required: ['email', 'full_name']
    },
    superAdminOnly: true,
    summarize: (args) => `Added ${args.role ?? 'member'} ${args.full_name}`,
    handler: async (args, { admin }) => {
      const role = args.role === 'super_admin' ? 'super_admin' : 'member'
      const tempPw = args.password ?? (() => {
        const lower = 'abcdefghjkmnpqrstuvwxyz', upper = 'ABCDEFGHJKMNPQRSTUVWXYZ', digits = '23456789'
        const all = lower + upper + digits
        const req = [lower[0|Math.random()*lower.length], upper[0|Math.random()*upper.length], digits[0|Math.random()*digits.length]]
        const rest = Array.from({ length: 9 }, () => all[0|Math.random()*all.length])
        return [...req, ...rest].sort(() => Math.random() - 0.5).join('')
      })()
      const { data: created, error } = await admin.auth.admin.createUser({
        email: args.email, password: tempPw, email_confirm: true,
        user_metadata: { full_name: args.full_name }
      })
      if (error) throw new Error(error.message)
      await admin.from('profiles').update({ full_name: args.full_name, role }).eq('id', created.user!.id)
      return { id: created.user!.id, email: args.email, full_name: args.full_name, role, temp_password: tempPw }
    }
  },
  {
    name: 'add_task_comment',
    description: 'Add a comment to a task. Looks up by task title + project name.',
    parameters: {
      type: 'object',
      properties: {
        task_title: { type: 'string' },
        project_name: { type: 'string' },
        body: { type: 'string' }
      },
      required: ['task_title', 'body']
    },
    summarize: (args) => `Commented on "${args.task_title}"`,
    handler: async (args, { sb, user }) => {
      const t = await findTaskByTitle(sb, args.project_name ?? null, args.task_title)
      const { data, error } = await sb.from('task_comments').insert({
        task_id: t.id, body: args.body, author_id: user.id
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'add_checklist_item',
    description: 'Add a checklist item to a task.',
    parameters: {
      type: 'object',
      properties: {
        task_title: { type: 'string' },
        project_name: { type: 'string' },
        body: { type: 'string' }
      },
      required: ['task_title', 'body']
    },
    summarize: (args) => `Added checklist item to "${args.task_title}"`,
    handler: async (args, { sb }) => {
      const t = await findTaskByTitle(sb, args.project_name ?? null, args.task_title)
      const { count } = await sb.from('task_checklist_items').select('*', { count: 'exact', head: true }).eq('task_id', t.id)
      const { data, error } = await sb.from('task_checklist_items').insert({
        task_id: t.id, body: args.body, position: count ?? 0
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'set_checklist_item_done',
    description: 'Toggle a checklist item as done or not done. Looks up the item by partial body text on the matching task.',
    parameters: {
      type: 'object',
      properties: {
        task_title: { type: 'string' },
        item_body: { type: 'string' },
        done: { type: 'boolean' }
      },
      required: ['task_title', 'item_body', 'done']
    },
    summarize: (args) => `Marked "${args.item_body}" ${args.done ? 'done' : 'not done'}`,
    handler: async (args, { sb }) => {
      const t = await findTaskByTitle(sb, null, args.task_title)
      const { data: items } = await sb.from('task_checklist_items')
        .select('id, body').eq('task_id', t.id).ilike('body', `%${args.item_body}%`).limit(2)
      if (!items?.length) throw new Error(`No checklist item matching "${args.item_body}"`)
      if (items.length > 1) throw new Error(`Multiple items match: ${items.map((i: any) => i.body).join(', ')}`)
      const { data, error } = await sb.from('task_checklist_items').update({ done: args.done }).eq('id', items[0].id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'create_task_column',
    description: 'Add a new column to a project board (e.g. "Blocked"). Appended to the end.',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        name: { type: 'string' }
      },
      required: ['project_name', 'name']
    },
    summarize: (args) => `Added column "${args.name}" to ${args.project_name}`,
    handler: async (args, { sb, user }) => {
      const projectId = await findProjectId(sb, args.project_name)
      const { count } = await sb.from('task_columns').select('*', { count: 'exact', head: true }).eq('project_id', projectId)
      const { data, error } = await sb.from('task_columns').insert({
        project_id: projectId, name: args.name, position: count ?? 0, created_by: user.id
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'create_label',
    description: 'Create a label for a project (used to tag tasks).',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string', description: 'Hex like #6366f1; optional' }
      },
      required: ['project_name', 'name']
    },
    summarize: (args) => `Added label "${args.name}" to ${args.project_name}`,
    handler: async (args, { sb }) => {
      const projectId = await findProjectId(sb, args.project_name)
      const { data, error } = await sb.from('task_labels').insert({
        project_id: projectId, name: args.name, color: args.color ?? '#6366f1'
      }).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'attach_label',
    description: 'Apply a label to a task.',
    parameters: {
      type: 'object',
      properties: {
        task_title: { type: 'string' },
        project_name: { type: 'string' },
        label_name: { type: 'string' }
      },
      required: ['task_title', 'project_name', 'label_name']
    },
    summarize: (args) => `Labeled "${args.task_title}" with "${args.label_name}"`,
    handler: async (args, { sb }) => {
      const t = await findTaskByTitle(sb, args.project_name, args.task_title)
      const lbl = await findLabel(sb, args.project_name, args.label_name)
      const { error } = await sb.from('task_label_assignments').insert({ task_id: t.id, label_id: lbl.id })
      if (error && error.code !== '23505') throw error  // ignore unique violation
      return { task_id: t.id, label_id: lbl.id }
    }
  },

  // ---------- WRITE — UNSAFE (require confirmation) ----------
  {
    name: 'update_customer',
    description: 'Update fields on a customer. Lookup via `match` (name/company) or `id`. Only fields you supply are changed.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Customer name/company to look up. Provide id OR match.' },
        id:    { type: 'string' },
        name:    { type: 'string', description: 'New name' },
        company: { type: 'string' },
        email:   { type: 'string' },
        phone:   { type: 'string' },
        address: { type: 'string' },
        notes:   { type: 'string' }
      }
    },
    unsafe: true,
    summarize: (args) => `update customer ${args.match ?? args.id?.slice(0,8)+'…'}`,
    handler: async ({ match, id, ...rest }, { sb }) => {
      if (!id && !match) throw new Error('Provide id or match')
      if (!id) id = await findCustomerId(sb, match!)
      const updates = compactUpdates(rest)
      if (Object.keys(updates).length === 0) throw new Error('Nothing to update — supply at least one field')
      const { data, error } = await sb.from('customers').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'update_project',
    description: 'Update a project. Status changes also use this. Only fields you pass are changed.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Project name. Provide id OR match.' },
        id:    { type: 'string' },
        name:        { type: 'string', description: 'New name' },
        customer_name: { type: 'string', description: 'Reassign to a different customer (looked up by name)' },
        status:      { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'] },
        budget:      { type: 'number' },
        start_date:  { type: 'string' },
        end_date:    { type: 'string' },
        description: { type: 'string' }
      }
    },
    unsafe: true,
    summarize: (args) => `update project ${args.match ?? args.id?.slice(0,8)+'…'}`,
    handler: async ({ match, id, customer_name, ...rest }, { sb }) => {
      if (!id && !match) throw new Error('Provide id or match')
      if (!id) id = await findProjectId(sb, match!)
      const updates: any = compactUpdates(rest)
      if (customer_name) updates.customer_id = await findCustomerId(sb, customer_name)
      if (Object.keys(updates).length === 0) throw new Error('Nothing to update')
      const { data, error } = await sb.from('projects').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'update_task',
    description: 'Update a task. Lookup by task title (and optionally project_name to disambiguate).',
    parameters: {
      type: 'object',
      properties: {
        match:        { type: 'string', description: 'Task title to look up' },
        project_name: { type: 'string', description: 'Helps disambiguate' },
        id:           { type: 'string' },
        title:          { type: 'string', description: 'New title' },
        description:    { type: 'string' },
        priority:       { type: 'string', enum: ['low','medium','high','urgent'] },
        due_date:       { type: 'string' },
        assignee_email: { type: 'string', description: 'Reassign to a team member by email' },
        completed:      { type: 'boolean', description: 'Mark complete (true) or reopen (false)' }
      }
    },
    unsafe: true,
    summarize: (args) => `update task "${args.match ?? args.id?.slice(0,8)+'…'}"`,
    handler: async ({ match, id, project_name, assignee_email, completed, ...rest }, { sb }) => {
      if (!id && !match) throw new Error('Provide id or match')
      if (!id) id = (await findTaskByTitle(sb, project_name ?? null, match!)).id
      const updates: any = compactUpdates(rest)
      if (assignee_email !== undefined && assignee_email !== '') {
        const p = await findProfileByEmail(sb, assignee_email)
        updates.assignee_id = p.id
      }
      if (completed === true)  updates.completed_at = new Date().toISOString()
      if (completed === false) updates.completed_at = null
      if (Object.keys(updates).length === 0) throw new Error('Nothing to update')
      const { data, error } = await sb.from('tasks').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'move_task',
    description: 'Move a task to another column on the same project board. Use this for drag-drop-style moves.',
    parameters: {
      type: 'object',
      properties: {
        task_title:  { type: 'string' },
        project_name: { type: 'string' },
        to_column:   { type: 'string' }
      },
      required: ['task_title', 'to_column']
    },
    unsafe: true,
    summarize: (args) => `move "${args.task_title}" to ${args.to_column}`,
    handler: async ({ task_title, project_name, to_column }, { sb }) => {
      const t = await findTaskByTitle(sb, project_name ?? null, task_title)
      const targetColumnId = await findColumnId(sb, t.project_id, to_column)
      const { count } = await sb.from('tasks').select('*', { count: 'exact', head: true }).eq('column_id', targetColumnId)
      const { error } = await sb.rpc('move_task', { p_task_id: t.id, p_new_column_id: targetColumnId, p_new_position: count ?? 0 })
      if (error) throw error
      return { moved: true, task_id: t.id, to_column_id: targetColumnId }
    }
  },
  {
    name: 'update_invoice',
    description: 'Update invoice metadata. Note: replacing line items overwrites the existing items array entirely.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'invoice_no like INV-0001' },
        id:    { type: 'string' },
        status:     { type: 'string', enum: ['draft','sent','paid','overdue','cancelled'] },
        issue_date: { type: 'string' },
        due_date:   { type: 'string' },
        tax_rate:   { type: 'number' },
        notes:      { type: 'string' },
        items: {
          type: 'array',
          description: 'If supplied, REPLACES all existing line items. Each: {description, quantity, unit_price}.',
          items: { type: 'object', properties: {
            description: { type: 'string' }, quantity: { type: 'number' }, unit_price: { type: 'number' }
          } }
        }
      }
    },
    unsafe: true,
    summarize: (args) => `update invoice ${args.match ?? args.id?.slice(0,8)+'…'}`,
    handler: async ({ match, id, items, ...rest }, { sb }) => {
      if (!id && !match) throw new Error('Provide id or match (invoice_no)')
      if (!id) { const inv = await findInvoiceByNo(sb, match!); id = inv.id }
      const updates: any = compactUpdates(rest)
      if (rest.status === 'paid' && updates.status === 'paid') updates.paid_at = new Date().toISOString()
      if (rest.status && rest.status !== 'paid') updates.paid_at = null

      // Recompute totals if items provided
      if (Array.isArray(items)) {
        await sb.from('invoice_items').delete().eq('invoice_id', id)
        const computed = items.map((it: any, i: number) => ({
          invoice_id: id, description: it.description, quantity: Number(it.quantity ?? 1),
          unit_price: Number(it.unit_price ?? 0),
          amount: Number(it.quantity ?? 1) * Number(it.unit_price ?? 0), position: i
        }))
        const subtotal = computed.reduce((s: number, it: any) => s + it.amount, 0)
        const tax_rate = Number(rest.tax_rate ?? updates.tax_rate ?? 0)
        const tax_amount = +(subtotal * tax_rate / 100).toFixed(2)
        updates.subtotal = subtotal
        updates.tax_amount = tax_amount
        updates.total = subtotal + tax_amount
        if (computed.length) await sb.from('invoice_items').insert(computed)
      }

      if (Object.keys(updates).length === 0) throw new Error('Nothing to update')
      const { data, error } = await sb.from('invoices').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'update_expense',
    description: 'Update an expense. Lookup by description substring.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Expense description (substring)' },
        id:    { type: 'string' },
        description:  { type: 'string', description: 'New description' },
        amount:       { type: 'number' },
        category:     { type: 'string', enum: ['Software','Hardware','Travel','Subcontractor','Marketing','Salary','Other'] },
        expense_date: { type: 'string' },
        project_name: { type: 'string', description: 'Reassign to a project; pass empty string to make it general' },
        notes:        { type: 'string' }
      }
    },
    unsafe: true,
    summarize: (args) => `update expense "${args.match ?? args.id?.slice(0,8)+'…'}"`,
    handler: async ({ match, id, project_name, ...rest }, { sb }) => {
      if (!id && !match) throw new Error('Provide id or match')
      if (!id) id = (await findExpense(sb, match!)).id
      const updates: any = compactUpdates(rest)
      if (project_name !== undefined) {
        updates.project_id = project_name === '' ? null : await findProjectId(sb, project_name)
      }
      if (Object.keys(updates).length === 0) throw new Error('Nothing to update')
      const { data, error } = await sb.from('expenses').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'update_employee',
    description: 'Update an employee HR record. Super-admin only.',
    parameters: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Employee full_name' },
        id:    { type: 'string' },
        full_name:       { type: 'string', description: 'New name' },
        email:           { type: 'string' },
        phone:           { type: 'string' },
        role:            { type: 'string', description: 'Job title' },
        employment_type: { type: 'string', enum: ['full_time','part_time','contract','intern'] },
        base_salary:     { type: 'number' },
        joined_on:       { type: 'string' },
        active:          { type: 'boolean' },
        notes:           { type: 'string' }
      }
    },
    unsafe: true, superAdminOnly: true,
    summarize: (args) => `update employee ${args.match ?? args.id?.slice(0,8)+'…'}`,
    handler: async ({ match, id, ...rest }, { sb }) => {
      if (!id && !match) throw new Error('Provide id or match')
      if (!id) id = await findEmployeeId(sb, match!)
      const updates = compactUpdates(rest)
      if (Object.keys(updates).length === 0) throw new Error('Nothing to update')
      const { data, error } = await sb.from('employees').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'update_salary',
    description: 'Update a salary record (amount/bonus/deductions/notes). Super-admin only. Net amount is auto-recomputed.',
    parameters: {
      type: 'object',
      properties: {
        employee_name: { type: 'string' },
        year:          { type: 'number' },
        month:         { type: 'number' },
        amount:        { type: 'number' },
        bonus:         { type: 'number' },
        deductions:    { type: 'number' },
        notes:         { type: 'string' }
      },
      required: ['employee_name', 'year', 'month']
    },
    unsafe: true, superAdminOnly: true,
    summarize: (args) => `update salary ${args.employee_name} ${args.year}-${String(args.month).padStart(2,'0')}`,
    handler: async ({ employee_name, year, month, ...rest }, { sb }) => {
      const sal = await findSalary(sb, employee_name, year, month)
      const updates: any = compactUpdates(rest)
      const a = updates.amount ?? sal.amount
      const b = updates.bonus ?? sal.bonus
      const d = updates.deductions ?? sal.deductions
      updates.net_amount = Number(a) + Number(b) - Number(d)
      if (Object.keys(updates).length === 1 && 'net_amount' in updates) throw new Error('Nothing to update')
      const { data, error } = await sb.from('salaries').update(updates).eq('id', sal.id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'update_team_member',
    description: 'Update a team member\'s display name or role. Super-admin only for role; self-service for own name.',
    parameters: {
      type: 'object',
      properties: {
        email:     { type: 'string' },
        full_name: { type: 'string' },
        role:      { type: 'string', enum: ['member','super_admin'] }
      },
      required: ['email']
    },
    unsafe: true,
    summarize: (args) => `update ${args.email}${args.role ? ' role to ' + args.role : ''}${args.full_name ? ' name to ' + args.full_name : ''}`,
    handler: async ({ email, full_name, role }, { sb, profile }) => {
      const p = await findProfileByEmail(sb, email)
      if (role && profile.role !== 'super_admin') throw new Error('Only super_admin can change roles')
      const updates = compactUpdates({ full_name, role })
      if (Object.keys(updates).length === 0) throw new Error('Nothing to update')
      const { data, error } = await sb.from('profiles').update(updates).eq('id', p.id).select().single()
      if (error) throw error
      return data
    }
  },
  {
    name: 'generate_monthly_salaries',
    description: 'Bulk-create pending salary rows for every active employee for a given month, at their base_salary. Skips employees who already have a row. Super-admin only.',
    parameters: {
      type: 'object',
      properties: { year: { type: 'number' }, month: { type: 'number' } },
      required: ['year', 'month']
    },
    unsafe: true, superAdminOnly: true,
    summarize: (args) => `generate ${args.year}-${String(args.month).padStart(2,'0')} salaries from base`,
    handler: async ({ year, month }, { sb, user }) => {
      const { data: employees } = await sb.from('employees').select('id, full_name, base_salary').eq('active', true)
      const { data: existing } = await sb.from('salaries').select('employee_id').eq('period_year', year).eq('period_month', month)
      const existingIds = new Set((existing || []).map((s: any) => s.employee_id))
      const toInsert = (employees || [])
        .filter((e: any) => !existingIds.has(e.id))
        .map((e: any) => ({
          employee_id: e.id, period_year: year, period_month: month,
          amount: Number(e.base_salary ?? 0), bonus: 0, deductions: 0,
          net_amount: Number(e.base_salary ?? 0), status: 'pending', created_by: user.id
        }))
      if (toInsert.length === 0) return { inserted: 0, message: 'All active employees already have a row for this period' }
      const { data, error } = await sb.from('salaries').insert(toInsert).select()
      if (error) throw error
      return { inserted: data?.length ?? 0, employees: data?.map((d: any) => d.employee_id) }
    }
  },
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

Vocabulary:
  • team_member  = login user (profiles row). Lookup by email or full name.
  • employee     = HR record (employees row). Different table.
  • salary       = payroll record. Pass name = "Employee Name 2026-04" (or use id).
  • task_comment / task_checklist_item / project_update — id required (audit trail).
  • task_column  = a kanban column. Pass name = "ProjectName/ColumnName" or just column name + project_name. Use id when ambiguous.
  • task_label   = pass name = "ProjectName/LabelName".

Other lookups:
  • task     → title
  • invoice  → invoice_no like "INV-0001"
  • expense  → description (substring)
  • customer / project / employee → name`,
    parameters: {
      type: 'object',
      properties: {
        entity: {
          type: 'string',
          enum: [
            'customer','project','task','invoice','expense','employee','team_member',
            'salary','task_comment','task_checklist_item','task_column','task_label','project_update'
          ]
        },
        id:   { type: 'string', description: 'UUID. Provide id OR name.' },
        name: { type: 'string', description: 'Human-friendly identifier — looked up automatically.' },
        project_name: { type: 'string', description: 'Helps disambiguate kanban-related entities.' }
      },
      required: ['entity']
    },
    unsafe: true,
    summarize: (args) => `delete ${args.entity} "${args.name ?? (args.id ? args.id.slice(0,8)+'…' : '?')}"`,
    handler: async ({ entity, id, name, project_name }, { sb, admin, profile }) => {
      // Resolve name -> id
      if (!id && name) {
        if (entity === 'customer')      id = await findCustomerId(sb, name)
        else if (entity === 'project')  id = await findProjectId(sb, name)
        else if (entity === 'employee') id = await findEmployeeId(sb, name)
        else if (entity === 'invoice')  { const inv = await findInvoiceByNo(sb, name); id = inv.id }
        else if (entity === 'task')     id = (await findTaskByTitle(sb, project_name ?? null, name)).id
        else if (entity === 'expense')  id = (await findExpense(sb, name)).id
        else if (entity === 'team_member') id = (await findTeamMember(sb, name)).id
        else if (entity === 'task_column') {
          if (!project_name) throw new Error('project_name is required for task_column lookup')
          id = await findColumnId(sb, await findProjectId(sb, project_name), name)
        }
        else if (entity === 'task_label') {
          if (!project_name) throw new Error('project_name is required for task_label lookup')
          id = (await findLabel(sb, project_name, name)).id
        }
        else if (entity === 'salary') {
          // name format: "Employee Name 2026-04"
          const m = name.match(/^(.+?)\s+(\d{4})-(\d{1,2})$/)
          if (!m) throw new Error('For salary, pass name as "Employee Name YYYY-MM" or use id')
          id = (await findSalary(sb, m[1].trim(), Number(m[2]), Number(m[3]))).id
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
        invoice: 'invoices', expense: 'expenses', employee: 'employees',
        salary: 'salaries',
        task_comment: 'task_comments', task_checklist_item: 'task_checklist_items',
        task_column: 'task_columns', task_label: 'task_labels',
        project_update: 'project_updates'
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

// -------- GROQ CALL -----------------------------------------------------------
function toOpenAITool(t: Tool) {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }
}

const SYSTEM_PROMPT =
`You are the WEDDZ PM assistant. Help the user manage customers, projects, invoices, expenses, salaries, and the kanban board for the WEDDZ IT business.

Vocabulary distinction (don't confuse — these are different tables):
- TEAM MEMBER = a login user (profiles row). Has a role (super_admin or member).
- EMPLOYEE   = an HR record (employees row) with salary info. Used for payroll.
- A person can be one, both, or neither.

Capabilities:
- Reads (always safe): list_*, get_business_overview, get_project_financials, get_monthly_revenue_expenses, get_top_customers, get_upcoming_invoice_due, monthly_expense_summary, dashboard_summary.
- Creates (always safe): create_customer, create_project, create_task, create_expense, create_invoice, create_employee, create_salary, add_team_member, add_task_comment, add_checklist_item, set_checklist_item_done, create_task_column, create_label, attach_label, add_project_update.
- Updates and deletes (CONFIRM REQUIRED — the framework auto-pauses for the user): update_*, delete_record, mark_invoice_paid, set_project_status, pay_salary, set_profile_role, set_team_member_active, generate_monthly_salaries, move_task.

Guidelines:
- All currency is LKR (Sri Lankan Rupees).
- **Call the matching tool first.** Every name-accepting tool does fuzzy lookup; you almost never need to ask for a UUID. Only ask for clarification when a tool returns "no match" or "multiple matches".
- The user refers to records descriptively ("the test member", "the LMS project", "the tea expense"). Pass those words straight into the tool's \`name\` / \`match\` argument.
- For "how are we doing" / financial questions, use get_business_overview or get_project_financials before pulling raw lists. They return computed numbers in one call.
- After an action, summarize the result in one sentence with the key numbers/names.
- Multiple tools are OK in one turn; chain them when sensible (look up first, act second).
- For risky actions (mark paid, change role, delete, pay salary, change project status) the platform will pause for user confirmation — call them anyway; the framework handles the prompt.
- Be concise. After a tool call, summarize the result in one sentence.
- Never invent IDs. Look things up by name with the list_* / get_* tools.
- If a tool returns an error, surface it plainly and offer the next step.`

// Custom error type so the main handler can render a friendly message
// for rate-limit responses instead of a 502 to the client.
class RateLimitError extends Error {
  retryAfterSec: number
  constructor(retryAfterSec: number, msg: string) { super(msg); this.retryAfterSec = retryAfterSec }
}

/**
 * Llama models on Groq sometimes emit malformed tool calls — either their
 * native syntax (Llama 3.x) or a JSON array of {name, parameters} objects
 * (Llama 4). Groq rejects with `tool_use_failed` and includes the raw text
 * in `failed_generation`. Parse here so the conversation can recover.
 *
 * We also strip null values from parsed args — Llama loves to send
 * `{"category": null}` for optional fields, which violates strict OpenAI
 * schemas and causes a separate validation error.
 */
function parseFailedGeneration(failedText: string): { name: string; arguments: string } | null {
  // Shape 1: <function=NAME{...}</function>  or  <function=NAME>{...}</function>
  const m1 = /<function=([\w.-]+)>?\s*(\{[\s\S]*?\})\s*<\/function>/i.exec(failedText)
  if (m1) return { name: m1[1], arguments: cleanArgs(m1[2]) }

  // Shape 2: <|python_tag|>NAME.call({...})
  const m2 = /<\|python_tag\|>\s*([\w.-]+)\.call\((\{[\s\S]*?\})\)/i.exec(failedText)
  if (m2) return { name: m2[1], arguments: cleanArgs(m2[2]) }

  // Shape 3: JSON array — [{"name": "...", "parameters" or "arguments": {...}}]
  // or single object — possibly with leading commentary text before the JSON.
  // Locate the first `[` or `{` and parse from there.
  const firstBracket = failedText.search(/[\[{]/)
  if (firstBracket >= 0) {
    const candidate = failedText.slice(firstBracket).trim()
    // Try shrinking from the right to find a complete JSON parse
    for (let end = candidate.length; end > 0; end--) {
      try {
        const parsed = JSON.parse(candidate.slice(0, end))
        const first = Array.isArray(parsed) ? parsed[0] : parsed
        if (first && typeof first === 'object' && first.name) {
          const argObj = first.parameters ?? first.arguments ?? {}
          return { name: first.name, arguments: cleanArgs(JSON.stringify(argObj)) }
        }
        break  // parsed but not a tool call
      } catch { /* keep shrinking */ }
    }
  }

  return null
}

/** Strip null/undefined values from a JSON args string */
function cleanArgs(raw: string): string {
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const cleaned: any = {}
      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && v !== undefined) cleaned[k] = v
      }
      return JSON.stringify(cleaned)
    }
  } catch { /* fall through */ }
  return raw
}

async function callGroq(messages: any[], tools: Tool[], groqKey: string): Promise<any> {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: tools.map(toOpenAITool),
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 1024
    })
  })
  if (!resp.ok) {
    const txt = await resp.text()
    if (resp.status === 429) {
      // Groq returns either a Retry-After header or "Please try again in Xs" / "X.YYs" in the body
      let retry = 30
      const headerVal = resp.headers.get('retry-after')
      if (headerVal) {
        const n = parseFloat(headerVal)
        if (!isNaN(n)) retry = Math.ceil(n)
      } else {
        const m = /try again in ([\d.]+)s/i.exec(txt) || /retry.*?([\d.]+)\s*s/i.exec(txt)
        if (m) retry = Math.ceil(parseFloat(m[1]))
      }
      throw new RateLimitError(retry, txt.slice(0, 200))
    }
    // Groq's tool_use_failed: try to parse the malformed function call so we
    // can keep going. Synthesize a normal tool_calls response if we succeed.
    if (resp.status === 400) {
      try {
        const errBody = JSON.parse(txt)
        if (errBody?.error?.code === 'tool_use_failed' && errBody.error.failed_generation) {
          const parsed = parseFailedGeneration(errBody.error.failed_generation)
          if (parsed) {
            return {
              choices: [{
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [{
                    id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
                    type: 'function',
                    function: { name: parsed.name, arguments: parsed.arguments }
                  }]
                },
                finish_reason: 'tool_calls'
              }]
            }
          }
        }
      } catch { /* fall through */ }
    }
    throw new Error(`Groq ${resp.status}: ${txt.slice(0, 400)}`)
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
  const groqKey     = Deno.env.get('GROQ_API_KEY')
  if (!groqKey) return json({ error: 'GROQ_API_KEY not set' }, 500)

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

  // Build OpenAI-format conversation. The system prompt is injected by callGroq.
  const conv: any[] = []
  for (const m of incoming) {
    if (m.role === 'user') conv.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant' && m.content) conv.push({ role: 'assistant', content: m.content })
  }

  const actionsTaken: { tool: string; summary: string; result?: unknown }[] = []

  // Helper: synthesize a tool_call_id since we're injecting tool turns ourselves
  // (the model didn't emit them — we did, on behalf of the confirm flow or
  // unknown-tool / forbidden-tool synthetic turns).
  const synthCallId = () => `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

  // If the previous turn produced a pending_action and the user confirmed,
  // execute it BEFORE calling the model again so the model can see the result.
  if (confirmedAction) {
    const tool = TOOLS.find(t => t.name === confirmedAction.tool)
    if (!tool) return json({ error: `Unknown tool ${confirmedAction.tool}` }, 400)
    if (tool.superAdminOnly && profile.role !== 'super_admin') return json({ error: 'forbidden' }, 403)
    const callId = synthCallId()
    try {
      const result = await tool.handler(confirmedAction.args, ctx)
      const summary = tool.summarize ? tool.summarize(confirmedAction.args, result) : `${tool.name} ok`
      actionsTaken.push({ tool: tool.name, summary, result })
      // Append a synthetic assistant tool_call + tool result so the model can finish the thought
      conv.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: callId, type: 'function',
          function: { name: tool.name, arguments: JSON.stringify(confirmedAction.args ?? {}) }
        }]
      })
      conv.push({ role: 'tool', tool_call_id: callId, content: JSON.stringify({ result }) })
    } catch (e) {
      const msg = String((e as any)?.message ?? e)
      conv.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: callId, type: 'function',
          function: { name: confirmedAction.tool, arguments: JSON.stringify(confirmedAction.args ?? {}) }
        }]
      })
      conv.push({ role: 'tool', tool_call_id: callId, content: JSON.stringify({ error: msg }) })
      actionsTaken.push({ tool: confirmedAction.tool, summary: `failed: ${msg}` })
    }
  }

  // Filter tools by role
  const availableTools = TOOLS.filter(t => !t.superAdminOnly || profile.role === 'super_admin')

  // Loop
  for (let step = 0; step < MAX_STEPS; step++) {
    let resp
    try {
      resp = await callGroq(conv, availableTools, groqKey)
    } catch (e) {
      // Render rate-limit as a friendly assistant message (200) instead of 502 —
      // so the chat panel shows it inline like any other turn.
      if (e instanceof RateLimitError) {
        return json({
          message: `The AI service is busy right now (rate limit hit). Please try again in about ${e.retryAfterSec} seconds.`,
          actions_taken: actionsTaken,
          error_kind: 'rate_limit',
          retry_after_sec: e.retryAfterSec
        })
      }
      return json({ error: String((e as any)?.message ?? e) }, 502)
    }
    const choice = resp?.choices?.[0]
    const msg = choice?.message
    if (!msg) return json({ message: 'I got an empty response from the model.', actions_taken: actionsTaken })

    const toolCalls = msg.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }> | undefined

    if (toolCalls && toolCalls.length > 0) {
      // First, append the assistant's tool_calls turn verbatim (required by OpenAI spec)
      conv.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: toolCalls
      })

      // Then handle each call. If any call is unsafe, halt and return pending_action.
      // Process all calls before deciding (so we don't half-execute a batch).
      let pendingAction: { tool: string; args: any; summary: string; call_id: string } | null = null

      for (const tc of toolCalls) {
        const name = tc.function.name
        let args: any = {}
        try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {} } catch { args = {} }
        const tool = TOOLS.find(t => t.name === name)

        if (!tool) {
          conv.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: 'unknown tool' }) })
          continue
        }
        if (tool.superAdminOnly && profile.role !== 'super_admin') {
          conv.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: 'super_admin only' }) })
          continue
        }
        if (tool.unsafe) {
          // Capture the first unsafe call as the pending action
          if (!pendingAction) {
            const summary = tool.summarize ? tool.summarize(args) : `Run ${name}`
            pendingAction = { tool: name, args, summary, call_id: tc.id }
          }
          // Stub the tool result so the conversation stays valid (the user will
          // re-trigger via confirmed_action which builds a fresh turn).
          conv.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ pending_confirmation: true }) })
          continue
        }
        try {
          const result = await tool.handler(args ?? {}, ctx)
          const summary = tool.summarize ? tool.summarize(args, result) : `${name} ok`
          actionsTaken.push({ tool: name, summary, result })
          conv.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ result }) })
        } catch (e) {
          const errMsg = String((e as any)?.message ?? e)
          actionsTaken.push({ tool: name, summary: `failed: ${errMsg}` })
          conv.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: errMsg }) })
        }
      }

      if (pendingAction) {
        return json({
          message: `I'd like to ${pendingAction.summary}. Confirm to proceed.`,
          actions_taken: actionsTaken,
          pending_action: { tool: pendingAction.tool, args: pendingAction.args, summary: pendingAction.summary }
        })
      }
      continue
    }

    // Plain text response
    return json({ message: msg.content ?? '', actions_taken: actionsTaken })
  }

  return json({ message: 'Hit step limit. Try a more specific request.', actions_taken: actionsTaken })
})
