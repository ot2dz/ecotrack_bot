// src/bot/middlewares/auth.ts

import { MyContext } from '../types/context.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

// قراءة المعرفات من متغيرات البيئة مرة واحدة عند بدء التشغيل
const allowedUserIds = new Set(
  (env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(Boolean) // إزالة أي قيم فارغة أو غير صالحة
);

if (allowedUserIds.size > 0) {
  logger.info(`🔐 Bot access is restricted to ${allowedUserIds.size} user(s).`);
} else {
  logger.warn('⚠️ Bot access is not restricted. ALLOWED_USER_IDS is not set.');
}

/**
 * وسيط للتحقق مما إذا كان المستخدم مسموحًا له باستخدام البوت.
 */
export async function authMiddleware(ctx: MyContext, next: () => Promise<void>) {
  // إذا لم تكن هناك قائمة معرفات، اسمح للجميع بالمرور
  if (allowedUserIds.size === 0) {
    return next();
  }

  const userId = ctx.from?.id;

  if (userId && allowedUserIds.has(userId)) {
    // المستخدم مصرح له، اسمح له بالمرور إلى الأمر التالي
    return next();
  }

  // المستخدم غير مصرح له
  logger.warn({ userId: userId, username: ctx.from?.username }, 'Unauthorized access attempt blocked.');

  await ctx.reply('🚫 عذرًا، ليس لديك الصلاحية لاستخدام هذا البوت.');

  // لا تقم باستدعاء next() لإيقاف المعالجة
}