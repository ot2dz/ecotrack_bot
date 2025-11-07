import dotenv from 'dotenv';
import { z } from 'zod';

// تحميل ملف .env
dotenv.config();

// تعريف مخطط Zod للتحقق من القيم المطلوبة
const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(10, 'TELEGRAM_BOT_TOKEN is required and must be valid'),
  ECOTRACK_BASE_URL: z
    .string()
    .url('ECOTRACK_BASE_URL must be a valid URL')
    .min(10, 'ECOTRACK_BASE_URL is required'),
  ECOTRACK_API_KEY: z.string().min(10, 'ECOTRACK_API_KEY is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  WEB_APP_URL: z.string().url('WEB_APP_URL must be a valid URL').optional(),
  ALLOWED_USER_IDS: z.string().optional(),
});

// نتحقق من القيم
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

// نصدّر القيم الآمنة
export const env = parsed.data;

// عرض مختصر عند التشغيل (اختياري)
export function logEnvSummary() {
  console.log('🧩 Environment Configuration:');
  console.log(`- Mode: ${env.NODE_ENV}`);
  console.log(`- Port: ${env.PORT}`);
  console.log(`- Telegram Token: ${env.TELEGRAM_BOT_TOKEN.slice(0, 5)}...`);
  console.log(`- EcoTrack Base URL: ${env.ECOTRACK_BASE_URL}`);
  console.log(`- API Key: ${env.ECOTRACK_API_KEY.slice(0, 5)}...`);
  if (env.WEB_APP_URL) {
    console.log(`- Web App URL: ${env.WEB_APP_URL}`);
  } else {
    console.log('- Web App URL: not configured');
  }
}
