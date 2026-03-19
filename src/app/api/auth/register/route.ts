import { NextRequest } from 'next/server';
import { forbiddenResponse } from '@/lib/api';

export async function POST(_request: NextRequest) {
  return forbiddenResponse('当前线上版本已关闭注册');
}
