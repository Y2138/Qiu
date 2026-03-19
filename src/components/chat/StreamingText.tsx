'use client'

import { useEffect, useRef, useState, memo } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { Cursor } from './Cursor'
import { cn } from '@/utils/helpers'

interface StreamingTextProps {
  content: string
  isStreaming: boolean
  speed?: number
  showCursor?: boolean
  onTyping?: () => void
  onComplete?: () => void
  className?: string
}

function hasUnclosedCodeBlock(text: string): boolean {
  const codeBlockCount = (text.match(/```/g) || []).length
  return codeBlockCount % 2 !== 0
}

export const StreamingText = memo(function StreamingText({
  content,
  isStreaming,
  speed = 30,
  showCursor = true,
  onTyping,
  onComplete,
  className,
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState('')
  const displayedLengthRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const onTypingRef = useRef(onTyping)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onTypingRef.current = onTyping
  }, [onTyping])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!isStreaming) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (displayedLengthRef.current < content.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDisplayedText(content)
        displayedLengthRef.current = content.length
      }
      return
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp
      }

      const elapsed = timestamp - lastTimeRef.current
      const charsToAdd = Math.floor(elapsed / speed)

      if (charsToAdd > 0) {
        lastTimeRef.current = timestamp - (elapsed % speed)
        const newLength = Math.min(
          displayedLengthRef.current + charsToAdd,
          content.length
        )

        if (newLength !== displayedLengthRef.current) {
          displayedLengthRef.current = newLength
          setDisplayedText(content.slice(0, newLength))
          onTypingRef.current?.()
        }
      }

      if (displayedLengthRef.current < content.length) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        onCompleteRef.current?.()
      }
    }

    if (displayedLengthRef.current < content.length) {
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [content, isStreaming, speed])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const shouldBufferCodeBlock = isStreaming && hasUnclosedCodeBlock(displayedText)
  const showEndCursor = showCursor && isStreaming

  return (
    <span className={cn('inline', className)}>
      {shouldBufferCodeBlock ? (
        <span className="whitespace-pre-wrap break-words">
          {displayedText}
          {showCursor && isStreaming && <Cursor />}
        </span>
      ) : (
        <>
          <MarkdownRenderer content={displayedText} />
          {showEndCursor && <Cursor />}
        </>
      )}
    </span>
  )
})
