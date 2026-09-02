type CheckboxProps = {
  checked?: boolean
  onChange?: (checked: boolean) => void
  label?: string
}

export function Checkbox({ checked = false, onChange, label }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      {label ? <span>{label}</span> : null}
    </label>
  )
}
