import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

type InputProps = {
  label?: string
  type?: string
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  icon?: ReactNode
  className?: string
  id?: string
  name?: string
}

export function Input({ label, type = 'text', placeholder, value, onChange, icon, className, id, name }: InputProps) {
  return (
    <div className="space-y-2">
      {label ? <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label> : null}
      <div className={cn('relative', className)}>
        {icon ? <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{icon}</span> : null}
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value)}
          className={cn(
            'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
            icon ? 'pl-10' : '',
          )}
        />
      </div>
    </div>
  )
}
