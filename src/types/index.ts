export type ThemeMode = 'light' | 'dark' | 'system'
export type NavItem = {
  id: string
  label: string
  icon: string
  path: string
  active?: boolean
}

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify'
export type Permission = 'view' | 'download' | 'edit'

export type User = {
  id: string
  name: string
  email: string
  avatar: string
}
