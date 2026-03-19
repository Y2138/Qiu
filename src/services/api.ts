import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types/api'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api'

// Token 管理器 - 用于获取和设置认证令牌
let _logoutHandler: (() => void) | null = null

// 设置登出处理函数
export function setLogoutHandler(handler: () => void): void {
  _logoutHandler = handler
}

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // 启用 cookie 认证
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // Cookie 认证由浏览器自动发送，不需要手动添加 Authorization 头
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器 - 处理 401 错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      _logoutHandler?.()
    }
    return Promise.reject(error)
  }
)

/**
 * 处理后端包装响应，提取 data 部分
 */
function extractData<T>(response: AxiosResponse<ApiResponse<T>>): T {
  if (response.data.success && response.data.data !== undefined) {
    return response.data.data
  }
  throw new Error(response.data.error?.message || '请求失败')
}

/**
 * GET 请求
 */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<ApiResponse<T>> = await apiClient.get(url, config)
  return extractData<T>(response)
}

/**
 * POST 请求
 */
export async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<ApiResponse<T>> = await apiClient.post(url, data, config)
  return extractData<T>(response)
}

/**
 * PUT 请求
 */
export async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<ApiResponse<T>> = await apiClient.put(url, data, config)
  return extractData<T>(response)
}

/**
 * DELETE 请求
 */
export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<ApiResponse<T>> = await apiClient.delete(url, config)
  return extractData<T>(response)
}

/**
 * PATCH 请求
 */
export async function patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response: AxiosResponse<ApiResponse<T>> = await apiClient.patch(url, data, config)
  return extractData<T>(response)
}

export { apiClient }
export default apiClient
