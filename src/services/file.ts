import type { UploadedFile, FileUploadProgress, FileType } from '@/types/file'

const API_BASE = '/api/files'

export interface FileValidationResult {
  valid: boolean
  error?: string
}

export function getFileType(mimeType: string): FileType {
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown'
  ) {
    return 'document'
  }
  return 'other'
}

export function validateFile(file: File): FileValidationResult {
  const inferredMimeType = file.type || inferMimeTypeFromName(file.name)
  const fileType = getFileType(inferredMimeType)
  const allowedTypes: Record<FileType, string[]> = {
    document: [
      'application/pdf',
      'text/plain',
      'text/markdown',
    ],
    image: [],
    audio: [],
    video: [],
    other: [],
  }

  const maxSize = 50 * 1024 * 1024 // 50MB

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `文件大小超过限制 (最大 ${maxSize / 1024 / 1024}MB)`,
    }
  }

  const allowed = allowedTypes[fileType]
  if (fileType !== 'other' && allowed.length > 0 && !allowed.includes(inferredMimeType)) {
    return {
      valid: false,
      error: `不支持的文件类型: ${inferredMimeType || file.name}`,
    }
  }

  return { valid: true }
}

function inferMimeTypeFromName(name: string): string {
  if (/\.md$/i.test(name)) return 'text/markdown'
  if (/\.txt$/i.test(name)) return 'text/plain'
  if (/\.pdf$/i.test(name)) return 'application/pdf'
  return ''
}

export async function uploadFile(
  file: File,
  options?: { sessionId?: string },
  onProgress?: (progress: FileUploadProgress) => void
): Promise<UploadedFile> {
  const fileId = crypto.randomUUID()

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    if (options?.sessionId) {
      formData.append('sessionId', options.sessionId)
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.({
          fileId,
          progress: Math.round((event.loaded / event.total) * 100),
          status: 'uploading',
        })
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as {
            data?: Record<string, unknown>
          } & Record<string, unknown>
          const payload = (response.data && typeof response.data === 'object'
            ? response.data
            : response) as Record<string, unknown>
          const resolvedMimeType =
            readStringField(payload, ['mimeType', 'fileType'])
            || file.type
            || inferMimeTypeFromName(file.name)
          const resolvedSize =
            readNumberField(payload, ['size', 'fileSize'])
            ?? file.size
          const resolvedName =
            readStringField(payload, ['name', 'originalName'])
            || file.name

          onProgress?.({
            fileId,
            progress: 100,
            status: 'completed',
          })
          resolve({
            id: readStringField(payload, ['id']) || fileId,
            name: resolvedName,
            type: getFileType(resolvedMimeType),
            mimeType: resolvedMimeType,
            size: resolvedSize,
            url: readStringField(payload, ['url']),
            createdAt: new Date(),
          })
        } catch {
          reject(new Error('Invalid response format'))
        }
      } else {
        onProgress?.({
          fileId,
          progress: 0,
          status: 'error',
          error: `Upload failed: ${xhr.statusText}`,
        })
        reject(new Error(`Upload failed: ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', () => {
      onProgress?.({
        fileId,
        progress: 0,
        status: 'error',
        error: 'Network error',
      })
      reject(new Error('Network error'))
    })

    xhr.open('POST', `${API_BASE}/upload`)
    xhr.withCredentials = true // 包含 cookie 认证
    xhr.send(formData)
  })
}

function readStringField(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

function readNumberField(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

export async function deleteFile(fileId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${fileId}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`Delete failed: ${response.statusText}`)
  }
}
