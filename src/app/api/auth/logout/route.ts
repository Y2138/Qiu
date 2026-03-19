import { deleteAuthCookie } from '@/lib/auth';
import { successResponse } from '@/lib/api';

export async function POST() {
  await deleteAuthCookie();
  return successResponse(null, '登出成功');
}
