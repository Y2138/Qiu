'use client'

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { CodeBlock } from './CodeBlock'

interface MarkdownRendererProps {
  content: string
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const isInline = !match

    if (isInline) {
      return (
        <code
          className="rounded-md bg-muted-foreground/15 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <CodeBlock
        language={match[1]}
        code={String(children).replace(/\n$/, '')}
      />
    )
  },
  pre({ children }) {
    return <>{children}</>
  },
  p({ children }) {
    return <p className="mb-3 last:mb-0 break-words leading-7">{children}</p>
  },
  ul({ children }) {
    return <ul className="mb-3 list-disc space-y-1.5 pl-6 marker:text-muted-foreground">{children}</ul>
  },
  ol({ children }) {
    return <ol className="mb-3 list-decimal space-y-1.5 pl-6 marker:text-muted-foreground">{children}</ol>
  },
  li({ children }) {
    return <li className="pl-1">{children}</li>
  },
  h1({ children }) {
    return <h1 className="mb-4 mt-6 text-2xl font-bold first:mt-0">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="mb-3 mt-5 text-xl font-bold first:mt-0">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h3>
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 rounded-r-2xl border-l-4 border-primary/50 bg-background/60 py-2 pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    )
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {children}
      </a>
    )
  },
  hr() {
    return <hr className="my-4 border-border" />
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-2xl border border-border bg-background/70">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm leading-6">
          {children}
        </table>
      </div>
    )
  },
  thead({ children }) {
    return <thead className="bg-muted/80">{children}</thead>
  },
  tbody({ children }) {
    return <tbody className="[&_tr:last-child_td]:border-b-0">{children}</tbody>
  },
  tr({ children }) {
    return <tr className="border-b border-border/80">{children}</tr>
  },
  th({ children }) {
    return (
      <th className="border-b border-border px-4 py-3 align-top font-semibold whitespace-nowrap">
        {children}
      </th>
    )
  },
  td({ children }) {
    return <td className="border-b border-border/80 px-4 py-3 align-top text-foreground/90">{children}</td>
  },
  strong({ children }) {
    return <strong className="font-semibold text-foreground">{children}</strong>
  },
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  )
})
