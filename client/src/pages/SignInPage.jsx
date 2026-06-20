import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, PawPrint } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

export default function SignInPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: 'mahound', password: '1234' })
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-lg border border-slate-200 p-6 shadow-xl space-y-5">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-lg bg-emerald-700 text-white grid place-items-center mb-3">
            <PawPrint size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Pets&Claws</h1>
          <p className="text-sm text-slate-500 mt-1">Admin access for stock and POS</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
          <input
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button disabled={loading} className="w-full rounded-md bg-emerald-700 text-white py-2.5 text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60 flex items-center justify-center gap-2">
          <Lock size={15} /> {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
