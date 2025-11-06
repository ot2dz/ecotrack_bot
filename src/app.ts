import { logEnvSummary } from './config/env.js';
import { launchBot } from './bot/index.js';
import { logger } from './utils/logger.js';
import { createLookupAPI } from './api/lookup.api.js';
import { env } from './config/env.js';

console.log('🚀 Starting ECOTRACK BOT project...');
logEnvSummary();

// بدء API server للولايات والبلديات (يخدم الواجهة والـ API معاً)
const webPort = env.PORT;
createLookupAPI(webPort);

// بدء البوت
await launchBot();

logger.info('✅ Bot is running. Send /start in Telegram!');
logger.info(`✅ Web App & API available at http://localhost:${webPort}`);
