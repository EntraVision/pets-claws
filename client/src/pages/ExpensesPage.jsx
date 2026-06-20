import { useEffect, useState } from 'react'
import { Plus, ReceiptText, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApi } from '../hooks/useApi'
import { dateOnly, localDateInputValue, money } from '../lib/format'

export default function ExpensesPage() {
  const api = useApi()
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({ category_id: '', amount: '', expense_date: localDateInputValue(), vendor: '', notes: '' })

  const fetch = async () => {
    const [e, c] = await Promise.all([api.get('/api/expenses'), api.get('/api/expenses/categories')])
    setExpenses(e.data)
    setCategories(c.data)
  }

  useEffect(() => { fetch().catch(() => toast.error('Failed to load expenses')) }, [])

  const create = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/expenses', { ...form, amount: Number(form.amount), category_id: form.category_id || null })
      toast.success('Expense added')
      setForm({ category_id: '', amount: '', expense_date: localDateInputValue(), vendor: '', notes: '' })
      fetch()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add expense')
    }
  }

  const remove = async (expense) => {
    if (!window.confirm('Delete this expense?')) return
    await api.delete(`/api/expenses/${expense.id}`)
    toast.success('Expense deleted')
    fetch()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Expenses</h1>
        <p className="text-sm text-slate-500">Track rent, utilities, delivery, cleaning, and store costs.</p>
      </div>

      <form onSubmit={create} className="bg-white border border-slate-200 rounded-lg p-4 grid md:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Category</label>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
            <option value="">None</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Amount</label>
          <input required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Date</label>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Vendor</label>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Notes</label>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button className="rounded-md bg-emerald-700 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center gap-2">
          <Plus size={15} /> Add
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Vendor</th>
              <th className="text-left px-4 py-3">Notes</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map(expense => (
              <tr key={expense.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{dateOnly(expense.expense_date)}</td>
                <td className="px-4 py-3">{expense.category_name || '-'}</td>
                <td className="px-4 py-3">{expense.vendor || '-'}</td>
                <td className="px-4 py-3 text-slate-500">{expense.notes || '-'}</td>
                <td className="px-4 py-3 font-semibold">{money(expense.amount)}</td>
                <td className="px-4 py-3"><button onClick={() => remove(expense)} className="p-1.5 rounded text-red-600 hover:bg-red-50"><Trash2 size={15} /></button></td>
              </tr>
            ))}
            {!expenses.length && <tr><td colSpan="6" className="py-12 text-center text-slate-400"><ReceiptText className="mx-auto mb-2" />No expenses yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
