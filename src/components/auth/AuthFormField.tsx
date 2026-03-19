'use client'

import type { ReactNode } from 'react'
import { cn } from '@/utils/helpers'
import { Input } from '@/components/common/Input'

interface AuthFormFieldProps {
  id: string
  label: string
  type: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
  icon: ReactNode
  showPassword?: boolean
  passwordToggle?: ReactNode
}

export function AuthFormField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  icon,
  showPassword,
  passwordToggle,
}: AuthFormFieldProps) {
  const inputType =
    type === 'password' && !showPassword ? 'password' : type === 'password' ? 'text' : type
  const hasPasswordToggle = type === 'password' && passwordToggle

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="ml-1 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary">
          {icon}
        </div>
        <Input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cn('h-12 rounded-xl pl-12', hasPasswordToggle && 'pr-12')}
        />
        {hasPasswordToggle && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {passwordToggle}
          </div>
        )}
      </div>
    </div>
  )
}
