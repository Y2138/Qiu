'use client'

import { useState, useEffect } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { cn } from '@/utils/helpers'

interface CodeBlockProps {
  language: string
  code: string
  className?: string
}

export function CodeBlock({ language, code, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getLanguage = (lang: string) => {
    const lowerLang = lang.toLowerCase()
    if (lowerLang === 'vue') return 'html'
    return lowerLang
  }

  return (
    <div className={cn('relative group my-2', className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b rounded-t-lg bg-code-block text-code-block-foreground">
        <span className="text-sm capitalize">{language}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8 gap-2 px-2 text-code-block-foreground hover:bg-code-block/80 hover:text-primary"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              复制代码
            </>
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        style={isDark ? oneDark : oneLight}
        language={getLanguage(language)}
        PreTag="div"
        className="mt-0! rounded-t-none! overflow-hidden text-sm"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 0.5rem 0.5rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
