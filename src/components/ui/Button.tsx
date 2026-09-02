import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

type ButtonProps = {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
}

export function Button({ children, variant = 'primary', size = 'md', className, type = 'button', onClick }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-[#1f63ff] text-white shadow-[0_12px_30px_rgba(31,99,255,0.3)] hover:bg-[#1551d8]',
        variant === 'secondary' && 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50',
        variant === 'ghost' && 'bg-transparent text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
