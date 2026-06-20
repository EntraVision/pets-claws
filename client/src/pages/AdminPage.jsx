import { useEffect, useState } from 'react'
import { KeyRound, Plus, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'

const tabs = ['categories', 'suppliers', 'expense categories', 'users']
const permissionOptions = [
  { key: 'pos', label: 'POS' },
  { key: 'stock', label: 'Stock' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'monthly_report', label: 'Monthly Report' },
  { key: 'admin', label: 'Admin' },
]
const defaultStaffPermissions = { pos: true, stock: false, purchases: false, expenses: false, dashboard: false, monthly_report: false, admin: false }

export default function AdminPage() {
  const api = useApi()
  const { user: currentUser } = useAuth()
  const [active, setActive] = useState('categories')
  const [data, setData] = useState([])
  const [form, setForm] = useState({})
  const [passwordEdit, setPasswordEdit] = useState({ userId: null, value: '' })

  const endpoint = {
    categories: '/api/categories',
    suppliers: '/api/suppliers',
    'expense categories': '/api/expenses/categories',
    users: '/api/users',
  }[active]

  const fetch = async (targetEndpoint = endpoint, targetActive = active) => {
    const res = await api.get(targetEndpoint)
    if (targetActive === active) setData(res.data)
  }

  useEffect(() => {
    let ignore = false
    setData([])
    api.get(endpoint)
      .then(res => {
        if (!ignore) {
          setData(res.data)
          if (active === 'users') setPasswordEdit({ userId: null, value: '' })
        }
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [api, active, endpoint])

  const create = async (e) => {
    e.preventDefault()
    try {
      await api.post(endpoint, form)
      toast.success('Saved')
      setForm({})
      fetch()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed')
    }
  }

  const updateUser = async (user, patch) => {
    try {
      await api.patch(`/api/users/${user.id}`, patch)
      toast.success('User updated')
      fetch()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed')
    }
  }

  const setUserRole = (role) => {
    setForm({
      ...form,
      role,
      permissions: role === 'admin' ? {} : { ...defaultStaffPermissions, ...(form.permissions || {}) },
    })
  }

  const setFormPermission = (key, allowed) => {
    setForm({
      ...form,
      permissions: {
        ...defaultStaffPermissions,
        ...(form.permissions || {}),
        [key]: allowed,
      },
    })
  }

  const saveOwnPassword = async (targetUser) => {
    const password = passwordEdit.value.trim()
    if (!password) return toast.error('Enter a new password')
    await updateUser(targetUser, { password })
    setPasswordEdit({ userId: null, value: '' })
  }

  const permissionValue = (permissions, key) => Boolean((permissions || defaultStaffPermissions)[key])

  const ServiceAccess = ({ permissions, onChange }) => (
    <div className="space-y-2">
      {permissionOptions.map(option => {
        const allowed = permissionValue(permissions, option.key)
        return (
          <div key={option.key} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
            <p className="text-sm font-medium text-slate-700">{option.label}</p>
            <div className="grid grid-cols-2 w-36 rounded-md border border-slate-200 overflow-hidden text-xs shrink-0">
              <button
                type="button"
                onClick={() => onChange(option.key, true)}
                className={`px-2 py-1.5 ${allowed ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Allow
              </button>
              <button
                type="button"
                onClick={() => onChange(option.key, false)}
                className={`px-2 py-1.5 border-l border-slate-200 ${!allowed ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Deny
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-slate-500">Manage store setup and admin users.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="flex overflow-x-auto gap-2 border-b border-slate-100 p-3">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => { setActive(tab); setForm({}) }}
              className={`min-w-32 px-4 py-2.5 rounded-md text-sm font-semibold capitalize border transition-colors ${
                active === tab
                  ? 'bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="p-4 space-y-4">
          <form onSubmit={create} className={`grid gap-3 items-end ${active === 'users' ? 'md:grid-cols-3' : 'md:grid-cols-5'}`}>
            {active === 'users' ? (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Username</label>
                  <input required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.username || ''} onChange={e => setForm({ ...form, username: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Password</label>
                  <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="1234 default" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Role</label>
                  <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.role || 'staff'} onChange={e => setUserRole(e.target.value)}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {(form.role || 'staff') === 'staff' && (
                  <div className="md:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">Service access</label>
                    <ServiceAccess permissions={form.permissions || defaultStaffPermissions} onChange={setFormPermission} />
                  </div>
                )}
              </>
            ) : active === 'suppliers' ? (
              <>
                <Input label="Name" value={form.name || ''} onChange={value => setForm({ ...form, name: value })} required />
                <Input label="Email" value={form.email || ''} onChange={value => setForm({ ...form, email: value })} />
                <Input label="Phone" value={form.phone || ''} onChange={value => setForm({ ...form, phone: value })} />
                <Input label="Address" value={form.address || ''} onChange={value => setForm({ ...form, address: value })} />
              </>
            ) : (
              <>
                <Input label="Name" value={form.name || ''} onChange={value => setForm({ ...form, name: value })} required />
                {active === 'categories' && <Input label="Description" value={form.description || ''} onChange={value => setForm({ ...form, description: value })} />}
              </>
            )}
            <button className="rounded-md bg-emerald-700 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center gap-2">
              <Plus size={15} /> Add
            </button>
          </form>

          {active === 'users' ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {data.map(row => (
                <div key={row.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-semibold truncate">{row.username}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.role === 'admin' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {row.role}
                      </span>
                      <span className="text-xs text-slate-400">{row.active === false ? 'inactive' : 'active'}</span>
                    </div>
                    <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={row.role} onChange={e => updateUser(row, { role: e.target.value })}>
                      <option value="staff">staff</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  {row.role === 'admin' ? (
                    <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">All services allowed</div>
                  ) : (
                    <ServiceAccess
                      permissions={row.permissions}
                      onChange={(key, allowed) => updateUser(row, { permissions: { ...defaultStaffPermissions, ...row.permissions, [key]: allowed } })}
                    />
                  )}
                  {String(row.id) === String(currentUser?.id) && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      {passwordEdit.userId === row.id ? (
                        <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-end">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">New password</label>
                            <input
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                              type="password"
                              value={passwordEdit.value}
                              onChange={e => setPasswordEdit({ userId: row.id, value: e.target.value })}
                              autoFocus
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => saveOwnPassword(row)}
                            className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center gap-2"
                          >
                            <Save size={15} /> Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setPasswordEdit({ userId: null, value: '' })}
                            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPasswordEdit({ userId: row.id, value: '' })}
                          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                        >
                          <KeyRound size={15} /> Change password
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!data.length && <div className="px-4 py-8 text-center text-slate-400">No records</div>}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {data.map(row => (
                    <tr key={row.id} className="border-t first:border-t-0 border-slate-100">
                      <td className="px-4 py-3 font-semibold">{row.name || row.username}</td>
                      <td className="px-4 py-3 text-slate-500">{row.description || row.email || row.role || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{row.phone || (row.active === false ? 'inactive' : '')}</td>
                      <td className="px-4 py-3 text-slate-500">{row.item_count !== undefined ? `${row.item_count} items` : ''}</td>
                    </tr>
                  ))}
                  {!data.length && <tr><td className="px-4 py-8 text-center text-slate-400">No records</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, required }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input required={required} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}
