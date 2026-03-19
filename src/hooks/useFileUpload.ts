'use client'

import { useState, useCallback } from 'react'
import { uploadFile } from '@/services/file'
import type { FileUploadProgress } from '@/types/file'

interface UploadState {
  progress: FileUploadProgress | null
  isUploading: boolean
  error: string | null
}

export function useFileUpload() {
  const [uploadState, setUploadState] = useState<UploadState>({
    progress: null,
    isUploading: false,
    error: null,
  })

  const uploadFileCallback = useCallback(
    async (file: File) => {
      setUploadState({
        progress: null,
        isUploading: true,
        error: null,
      })

      try {
        const uploadedFile = await uploadFile(file, undefined, (progress: FileUploadProgress) => {
          setUploadState((prev) => ({
            ...prev,
            progress,
          }))
        })

        setUploadState({
          progress: {
            fileId: uploadedFile.id,
            progress: 100,
            status: 'completed',
          },
          isUploading: false,
          error: null,
        })

        return uploadedFile
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '文件上传失败'
        setUploadState({
          progress: uploadState.progress,
          isUploading: false,
          error: errorMessage,
        })
        throw new Error(errorMessage)
      }
    },
    [uploadState.progress]
  )

  const resetUploadState = useCallback(() => {
    setUploadState({
      progress: null,
      isUploading: false,
      error: null,
    })
  }, [])

  return {
    ...uploadState,
    uploadFile: uploadFileCallback,
    resetUploadState,
  }
}
