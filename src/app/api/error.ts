import { NextRequest, NextResponse } from 'next/server';

export function errorMiddleware(_request: NextRequest) {
  // 这个函数可以作为全局错误处理的入口点
  // 但实际上 Next.js API 路由已经内置了错误处理
  return null;
}

// 全局错误处理函数
export function handleApiError(error: unknown) {
  console.error('API Error:', error);

  if (error instanceof Error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      message: '服务器内部错误',
      code: 'UNKNOWN_ERROR',
    },
    { status: 500 }
  );
}
