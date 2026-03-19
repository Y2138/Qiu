'use client'

import { useEffect } from 'react'

interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  handler: () => void
  description?: string
}

export function useKeyboard(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const {
          key,
          ctrlKey = false,
          shiftKey = false,
          metaKey = false,
          altKey = false,
          handler,
        } = shortcut

        if (
          e.key === key &&
          e.ctrlKey === ctrlKey &&
          e.shiftKey === shiftKey &&
          e.metaKey === metaKey &&
          e.altKey === altKey
        ) {
          e.preventDefault()
          handler()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [shortcuts])
}

export function useKeyboardShortcuts() {
  // 默认快捷键
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'k',
      ctrlKey: true,
      handler: () => {
        // 快速搜索
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement
        searchInput?.focus()
      },
      description: '快速搜索',
    },
    {
      key: 'n',
      ctrlKey: true,
      handler: () => {
        // 新建对话
        window.dispatchEvent(new CustomEvent('new-chat'))
      },
      description: '新建对话',
    },
  ]

  useKeyboard(shortcuts)
}
