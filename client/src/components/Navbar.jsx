import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, Boxes, CalendarRange, CreditCard, Menu, ReceiptText, ShoppingBag, WalletCards, X, LogOut, Store } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/', label: 'Dashboard', icon: BarChart3, permission: 'dashboard' },
  { to: '/inventory', label: 'Stock', icon: Boxes, permission: 'stock' },
  { to: '/pos', label: 'POS', icon: CreditCard, permission: 'pos' },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBag, permission: 'purchases' },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText, permission: 'expenses' },
  { to: '/admin', label: 'Admin', icon: WalletCards, permission: 'admin' },
  { to: '/monthly-report', label: 'Monthly Report', icon: CalendarRange, permission: 'monthly_report' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { user, logout, can } = useAuth()
  const navigate = useNavigate()
  const visibleLinks = links.filter(link => can(link.permission))

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
      isActive ? 'bg-emerald-100 text-emerald-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
    }`

  const signOut = () => {
    logout()
    navigate('/sign-in')
  }

  const sidebar = (
    <div className="h-full flex flex-col bg-white border-r border-slate-200">
      <div className="h-16 px-4 flex items-center gap-3 border-b border-slate-100">
        <button onClick={() => navigate('/')} className="grid place-items-center w-10 h-10 rounded-md bg-emerald-700 text-white font-bold">
          P&C
        </button>
        <div className="min-w-0">
          <p className="font-bold text-emerald-900 leading-tight">Pets&Claws</p>
          <p className="text-xs text-slate-500 flex items-center gap-1"><Store size={12} /> Lebanon store</p>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 space-y-1">
        {visibleLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={linkClass} onClick={() => setOpen(false)}>
            <Icon size={18} /> <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="p-3 border-t border-slate-100">
        <div className="mb-2 px-3 py-2 rounded-md bg-slate-50 text-sm text-slate-600 flex items-center justify-between gap-2">
          <span className="truncate">{user?.username}</span>
          <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-500">
            {user?.role || 'user'}
          </span>
        </div>
        <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-red-600 hover:bg-red-50">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 font-bold text-emerald-800">
          <span className="grid place-items-center w-8 h-8 rounded-md bg-emerald-700 text-white">P&C</span>
          <span>Pets&Claws</span>
        </button>
        <button className="p-2 rounded-md hover:bg-slate-100" onClick={() => setOpen(!open)} aria-label="Open navigation">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64">
        {sidebar}
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} aria-label="Close navigation" />
          <aside className="relative w-72 max-w-[85vw] h-full shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}
    </>
  )
}
