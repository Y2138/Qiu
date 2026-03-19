import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

// 统一响应格式
export function successResponse<T>(data: T, message = 'Success') {
  return NextResponse.json({
    success: true,
    message,
    data,
  });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      message,
      data: null,
    },
    { status }
  );
}

export function validationErrorResponse(error: ZodError) {
  const errors = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));

  return NextResponse.json(
    {
      success: false,
      message: 'Validation failed',
      errors,
    },
    { status: 422 }
  );
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return errorResponse(message, 401);
}

export function forbiddenResponse(message = 'Forbidden') {
  return errorResponse(message, 403);
}

export function notFoundResponse(message = 'Not found') {
  return errorResponse(message, 404);
}

export function conflictResponse(message = 'Conflict') {
  return errorResponse(message, 409);
}

export function badRequestResponse(message = 'Bad request') {
  return errorResponse(message, 400);
}
