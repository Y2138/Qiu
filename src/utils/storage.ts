import { STORAGE_KEYS } from './constants'

// 检查是否在浏览器环境
function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function getStorageItem<T>(key: string, defaultValue: T): T {
  if (!isBrowser()) return defaultValue
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch {
    return defaultValue
  }
}

export function setStorageItem<T>(key: string, value: T): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error('Failed to save to localStorage:', error)
  }
}

export function removeStorageItem(key: string): void {
  if (!isBrowser()) return
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Failed to remove from localStorage:', error)
  }
}

export function clearStorage(): void {
  if (!isBrowser()) return
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key)
    })
  } catch (error) {
    console.error('Failed to clear localStorage:', error)
  }
}

export function getSessionStorageItem<T>(key: string, defaultValue: T): T {
  if (!isBrowser()) return defaultValue
  try {
    const item = sessionStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch {
    return defaultValue
  }
}

export function setSessionStorageItem<T>(key: string, value: T): void {
  if (!isBrowser()) return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error('Failed to save to sessionStorage:', error)
  }
}
