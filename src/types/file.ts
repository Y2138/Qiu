export type FileType = 'image' | 'document' | 'audio' | 'video' | 'other'

export interface UploadedFile {
  id: string
  name: string
  type: FileType
  mimeType: string
  size: number
  url?: string
  extractedContent?: string
  createdAt: Date
}

export interface FileUploadProgress {
  fileId: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

export const ALLOWED_FILE_TYPES: Record<FileType, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  document: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  video: ['video/mp4', 'video/webm'],
  other: [],
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
