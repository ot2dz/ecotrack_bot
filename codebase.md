# .gitignore

```
node_modules
dist
.env
.DS_Store

# Webapp compiled files
src/webapp/main.js

```

# package.json

```json
{
  "name": "ecotrack",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "dev": "nodemon --watch src --exec tsx src/app.ts",
    "build": "tsc",
    "start": "node dist/app.js",
    "webapp:build": "tsc src/webapp/main.ts --target ES2020 --module ESNext --moduleResolution Bundler --outDir src/webapp",
    "webapp:serve": "npm run webapp:build && npx serve src/webapp"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "@types/express": "^5.0.5",
    "axios": "^1.13.1",
    "dotenv": "^17.2.3",
    "express": "^5.1.0",
    "node-cache": "^5.1.2",
    "pino": "^10.1.0",
    "pino-pretty": "^13.1.2",
    "telegraf": "^4.16.3",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.0",
    "@types/node": "^24.9.2",
    "eslint": "^9.39.0",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-unused-imports": "^4.3.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.2.6",
    "nodemon": "^3.1.10",
    "prettier": "^3.6.2",
    "ts-node": "^10.9.2",
    "tsx": "^4.20.6",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.46.2"
  }
}

```

# README.md

```md

```

# src/api/lookup.api.ts

```ts
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { fetchWilayasCached, fetchCommunesCached } from '../services/lookup.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createLookupAPI(port: number = env.PORT) {
  const app = express();

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // API Routes
  app.get('/api/wilayas', async (req, res) => {
    try {
      const wilayas = await fetchWilayasCached();
      res.json({ success: true, data: wilayas });
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to fetch wilayas');
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  app.get('/api/communes', async (req, res) => {
    try {
      const wilayaId = req.query.wilaya_id;
      
      if (!wilayaId) {
        res.status(400).json({ success: false, error: 'wilaya_id parameter is required' });
        return;
      }

      const wilayaIdNum = Number(wilayaId);
      if (Number.isNaN(wilayaIdNum) || wilayaIdNum <= 0) {
        res.status(400).json({ success: false, error: 'Invalid wilaya_id' });
        return;
      }

      const communes = await fetchCommunesCached(wilayaIdNum);
      res.json({ success: true, data: communes });
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to fetch communes');
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  // Serve static files from webapp directory
  // المسار يعتمد على ما إذا كان الكود في src أو dist
  const webappPath = join(__dirname, '..', 'webapp');
  const altWebappPath = join(process.cwd(), 'src', 'webapp');
  
  // استخدام المسار الذي يوجد فعلياً
  const staticPath = existsSync(webappPath) ? webappPath : altWebappPath;
  app.use(express.static(staticPath));
  logger.info(`Serving static files from: ${staticPath}`);

  const server = app.listen(port, () => {
    logger.info(`✅ Web App & API server running on port ${port}`);
    logger.info(`   - Web App: http://localhost:${port}/index.html`);
    logger.info(`   - API Wilayas: http://localhost:${port}/api/wilayas`);
    logger.info(`   - API Communes: http://localhost:${port}/api/communes?wilaya_id=X`);
  });

  return server;
}


```

# src/app.ts

```ts
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

```

# src/bot/index.ts

```ts
import { Telegraf, Scenes, Markup } from 'telegraf';
import { z } from 'zod';
import { MyContext, OrderData } from './types/context.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { setupSession } from './middlewares/session.js';
import { createOrderScene } from './scenes/createOrder.js';

export const bot = new Telegraf<MyContext>(env.TELEGRAM_BOT_TOKEN);

// إعداد المشاهد (Scenes)
const stage = new Scenes.Stage<MyContext>([createOrderScene]);
bot.use(setupSession());
bot.use(stage.middleware());

// لوحة البداية
const keyboardRows: any[] = [];

if (env.WEB_APP_URL) {
  keyboardRows.push([Markup.button.webApp('🖥️ واجهة الطلبات', env.WEB_APP_URL)]);
}

keyboardRows.push(['🟢 رفع طلبية']);

const mainKeyboard = Markup.keyboard(keyboardRows).resize();

const webAppPayloadSchema = z.object({
  kind: z.literal('create-order'),
  data: z.object({
    nom_client: z.string().min(1),
    telephone: z.string().min(1),
    type: z.number().int().min(1).max(2),
    stop_desk: z.number().int().min(0).max(1),
    code_wilaya: z.number().int().positive(),
    commune: z.string().min(1),
    adresse: z.string().min(1),
    montant: z.number().positive(),
    produit: z.string().min(1),
    quantite: z.number().int().positive(),
  }),
});

bot.start(async (ctx) => {
  await ctx.reply(
    `👋 مرحبًا ${ctx.from?.first_name || 'صديقي'}!\n` +
      `أنا بوت التوصيل الخاص بـ EcoTrack 🚚\n\n` +
      `يمكنك رفع طلبية جديدة مباشرة عبر الزر أدناه:`,
    mainKeyboard,
  );
});

// الزر الأساسي
bot.hears('🟢 رفع طلبية', async (ctx) => {
  await ctx.scene.enter('create-order');
});

bot.on('message', async (ctx, next) => {
  const message = ctx.message as any;
  const rawPayload = message?.web_app_data?.data as string | undefined;

  logger.debug({ hasWebAppData: !!rawPayload, messageType: message?.text ? 'text' : 'other' }, 'Checking for web_app_data');

  if (!rawPayload) {
    return next();
  }

  logger.info({ payloadLength: rawPayload.length }, 'Received web_app_data from Web App');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload);
    logger.debug({ parsedJson }, 'Parsed web_app_data JSON');
  } catch (error) {
    logger.warn({ err: error, payload: rawPayload }, 'Invalid web_app_data JSON payload');
    await ctx.reply('❌ تعذر قراءة البيانات المرسلة من الواجهة. حاول مرة أخرى.');
    return;
  }

  const parsed = webAppPayloadSchema.safeParse(parsedJson);

  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten(), rawPayload }, 'Invalid web_app_data structure');
    await ctx.reply('❌ بيانات الواجهة غير صالحة. يرجى إعادة المحاولة.');
    return;
  }

  logger.info({ orderData: parsed.data.data }, 'Valid web_app_data received, processing order');

  const { data } = parsed.data;

  const orderFromWebApp: OrderData = {
    nom_client: data.nom_client,
    telephone: data.telephone,
    type: data.type,
    stop_desk: data.stop_desk,
    code_wilaya: data.code_wilaya,
    commune: data.commune,
    adresse: data.adresse,
    montant: String(data.montant),
    produit: data.produit,
    quantite: String(data.quantite),
  };

  try {
    logger.info({ orderFromWebApp }, 'Entering create-order scene with Web App data');
    await ctx.scene.enter('create-order', {
      fromWebApp: true,
      order: orderFromWebApp,
    });
    logger.info('Successfully entered create-order scene');
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to handle web_app_data payload');
    await ctx.reply('❌ حدث خطأ أثناء معالجة الطلب. حاول مرة أخرى.');
  }
});

// ✅ هنا نُعرّف دالة التشغيل
export async function launchBot() {
  try {
    await bot.launch();
    logger.info('✅ Bot is running. Send /start in Telegram!');
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to launch bot');
    process.exit(1);
  }

  // إيقاف البوت بطريقة نظيفة عند الخروج
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

```

# src/bot/middlewares/session.ts

```ts
import { session } from 'telegraf';
import { MyContext } from '../types/context.js';
import { logger } from '../../utils/logger.js';

export function setupSession() {
  return session({
    defaultSession: (): MyContext['session'] => ({
      order: {},
      step: null,
    }),
  });
}

export function resetOrderSession(ctx: MyContext) {
  ctx.session.order = {};
  ctx.session.step = null;
  logger.debug(`🔄 Session reset for user ${ctx.from?.id}`);
}

```

# src/bot/scenes/createOrder.ts

```ts
import { Scenes, Markup } from 'telegraf';
import { MyContext, OrderData } from '../types/context.js';
import { fetchWilayasCached, fetchCommunesCached } from '../../services/lookup.service.js';
import { createOrder } from '../../services/order.service.js';
import { logger } from '../../utils/logger.js';

/**
 * مشهد (Scene) إنشاء طلبية
 * هذا المشهد يجمع كل بيانات العميل خطوة بخطوة
 */

type CreateOrderSceneState = {
  fromWebApp?: boolean;
  order?: OrderData;
};

export const createOrderScene = new Scenes.BaseScene<MyContext>('create-order');

// -------------------------------------------------------------
// 🟢 الخطوة الأولى: دخول المشهد
// -------------------------------------------------------------
createOrderScene.enter(async (ctx) => {
  const state = ctx.scene.state as CreateOrderSceneState | undefined;

  if (state?.fromWebApp && state.order) {
    ctx.session.order = { ...state.order };
    ctx.session.step = null;
    await presentOrderForConfirmation(ctx);
    return;
  }

  ctx.session.order = {};
  ctx.session.step = null;
  await ctx.reply(
    '📦 حسناً، سنبدأ بإدخال معلومات الطلبية خطوة بخطوة.\n\n' +
      'أولاً، اختر نوع العملية:',
    Markup.inlineKeyboard([
      [Markup.button.callback('🚚 توصيل', 'type_1')],
      [Markup.button.callback('🔄 تبديل', 'type_2')],
    ]),
  );
});

// -------------------------------------------------------------
// 🟢 اختيار نوع العملية (توصيل أو تبديل)
// -------------------------------------------------------------
createOrderScene.action(/^type_(\d)$/, async (ctx) => {
  const type = Number(ctx.match[1]);
  ctx.session.order.type = type;
  await ctx.answerCbQuery();
  await ctx.reply(
    'اختر نوع الخدمة:',
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 إلى المنزل', 'stopdesk_0')],
      [Markup.button.callback('🏢 إلى المكتب (STOP DESK)', 'stopdesk_1')],
    ]),
  );
});

// -------------------------------------------------------------
// 🟢 اختيار نوع الخدمة
// -------------------------------------------------------------
createOrderScene.action(/^stopdesk_(\d)$/, async (ctx) => {
  const stopDesk = Number(ctx.match[1]);
  ctx.session.order.stop_desk = stopDesk;
  ctx.session.step = 'nom_client';
  await ctx.answerCbQuery();
  await ctx.reply('👤 أدخل اسم الزبون:');
});

// -------------------------------------------------------------
// 🧱 عرض قائمة الولايات مع التصفح (Pagination)
// -------------------------------------------------------------
async function showWilayas(ctx: MyContext, page = 0) {
  const wilayas = await fetchWilayasCached();
  const pageSize = 10;
  const totalPages = Math.ceil(wilayas.length / pageSize);
  const start = page * pageSize;
  const end = start + pageSize;
  const current = wilayas.slice(start, end);

  const buttons = current.map((w) => [Markup.button.callback(w.nom, `wilaya_${w.id}`)]);

  const navButtons = [];
  if (page > 0) navButtons.push(Markup.button.callback('◀️ السابق', `page_${page - 1}`));
  if (page < totalPages - 1) navButtons.push(Markup.button.callback('▶️ التالي', `page_${page + 1}`));
  if (navButtons.length) buttons.push(navButtons);

  await ctx.reply(
    `🏙️ اختر الولاية (صفحة ${page + 1}/${totalPages}):`,
    Markup.inlineKeyboard(buttons)
  );
}

// -------------------------------------------------------------
// 🟢 استجابة النصوص في الخطوات
// -------------------------------------------------------------
createOrderScene.on('text', async (ctx) => {
  const step = ctx.session.step;
  const text = ctx.message.text.trim();

  switch (step) {
    case 'nom_client':
      ctx.session.order.nom_client = text;
      ctx.session.step = 'telephone';
      await ctx.reply('📞 أدخل رقم هاتف الزبون:');
      break;

    case 'telephone':
      ctx.session.order.telephone = text;
      ctx.session.step = 'wilaya';
      await showWilayas(ctx);
      break;

    case 'adresse':
      ctx.session.order.adresse = text;
      ctx.session.step = 'montant';
      await ctx.reply('💰 أدخل المبلغ الواجب تحصيله (يشمل التوصيل):');
      break;

    case 'montant':
      ctx.session.order.montant = text;
      ctx.session.step = 'produit';
      await ctx.reply(
        '🧾 أدخل *مرجع المنتج (reference)* من المخزون (مثال: PROD001). يمكنك إدخال مرجع واحد الآن:',
        { parse_mode: 'Markdown' }
      );
      break;

    case 'produit': {
      const ref = text.trim();
      const isValidRef = /^[A-Za-z0-9._-]{2,64}$/.test(ref);
      if (!isValidRef) {
        await ctx.reply('⚠️ صيغة المرجع غير صحيحة. أدخل مرجعًا مثل: PROD001 أو A-123_45');
        break;
      }
      ctx.session.order.produit = ref;
      ctx.session.step = 'quantite';
      await ctx.reply('🔢 أدخل الكمية (عدد القطع):');
      break;
    }

    case 'quantite': {
      const qty = text.trim();
      const isInt = /^[1-9][0-9]*$/.test(qty);
      if (!isInt) {
        await ctx.reply('⚠️ أدخل رقمًا صحيحًا أكبر من 0 للكمية (مثال: 1 أو 2 أو 5).');
        break;
      }
      ctx.session.order.quantite = qty;
      ctx.session.step = null;
      await ctx.reply(
        '✅ تأكيد إرسال الطلبية؟',
        Markup.inlineKeyboard([
          [Markup.button.callback('📤 إرسال الطلبية', 'confirm_send')],
          [Markup.button.callback('❌ إلغاء', 'cancel_order')],
        ])
      );
      break;
    }

    default:
      await ctx.reply('⚠️ الرجاء اتباع الخطوات بالترتيب.');
  }
});

// -------------------------------------------------------------
// 🟢 التصفح بين صفحات الولايات
// -------------------------------------------------------------
createOrderScene.action(/^page_(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  await ctx.answerCbQuery();
  await showWilayas(ctx, page);
});

// -------------------------------------------------------------
// 🟢 اختيار الولاية
// -------------------------------------------------------------
createOrderScene.action(/^wilaya_(\d+)$/, async (ctx) => {
  const wilayaId = Number(ctx.match[1]);
  ctx.session.order.code_wilaya = wilayaId;
  await ctx.answerCbQuery();

  try {
    const communes = await fetchCommunesCached(wilayaId);
    if (!communes.length) {
      await ctx.reply('⚠️ لا توجد بلديات متوفرة لهذه الولاية.');
      return;
    }

    const firstSet = communes.slice(0, 10).map((c) => [Markup.button.callback(c, `commune_${c}`)]);
    await ctx.reply(
      `🏘️ اختر البلدية (${communes.length}):`,
      Markup.inlineKeyboard(firstSet)
    );
  } catch (error) {
    logger.error(error);
    await ctx.reply('❌ حدث خطأ أثناء تحميل البلديات.');
  }
});

// -------------------------------------------------------------
// 🟢 اختيار البلدية
// -------------------------------------------------------------
createOrderScene.action(/^commune_(.+)$/, async (ctx) => {
  ctx.session.order.commune = ctx.match[1];
  ctx.session.step = 'adresse';
  await ctx.answerCbQuery();
  await ctx.reply('📍 أدخل العنوان الكامل للزبون:');
});

// -------------------------------------------------------------
// 🟢 تأكيد الإرسال
// -------------------------------------------------------------
createOrderScene.action('confirm_send', async (ctx) => {
  await ctx.answerCbQuery();
  await presentOrderForConfirmation(ctx);
});

// -------------------------------------------------------------
// 🟢 إرسال الطلبية فعليًا إلى EcoTrack
// -------------------------------------------------------------
createOrderScene.action('send_order_now', async (ctx) => {
  await ctx.answerCbQuery('⏳ جاري إرسال الطلبية...');
  const o = ctx.session.order;

  try {
    const payload = {
      nom_client: o.nom_client!,
      telephone: o.telephone!,
      adresse: o.adresse!,
      code_wilaya: Number(o.code_wilaya),
      commune: o.commune!,
      montant: Number(o.montant),
      type: o.type!,
      stop_desk: o.stop_desk ?? 0,
      stock: 1,
      produit: o.produit!,
      quantite: o.quantite!,
    };

    await ctx.reply('📡 جاري إرسال البيانات إلى EcoTrack...');
    const result = await createOrder(payload);

    await ctx.replyWithMarkdown(
      `✅ *تم إرسال الطلبية بنجاح!*\n\nرقم التتبع: \`${result.tracking}\`\n\nيمكنك تتبعها لاحقًا عبر النظام.`
    );

    await ctx.scene.leave();
  } catch (err: any) {
    await ctx.reply(`❌ فشل إرسال الطلبية:\n${err.message}`);
    logger.error('Failed to send order', err);
  }
});

createOrderScene.action('restart_order', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.step = 'nom_client';
  ctx.session.order = {};
  await ctx.reply('🔁 لنبدأ من جديد، أدخل اسم الزبون:');
});

createOrderScene.action('cancel_order', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('❌ تم إلغاء العملية.');
  await ctx.scene.leave();
});

function buildOrderSummary(order: OrderData): string {
  const typeLabel = order.type === 1 ? 'توصيل' : order.type === 2 ? 'تبديل' : 'غير محدد';
  const serviceLabel = order.stop_desk === 0 ? 'إلى المنزل' : order.stop_desk === 1 ? 'إلى المكتب' : 'غير محدد';

  return `
📦 *تفاصيل الطلبية:*

👤 الاسم: ${order.nom_client ?? 'غير محدد'}
📞 الهاتف: ${order.telephone ?? 'غير محدد'}
🏙️ الولاية: ${order.code_wilaya ?? 'غير محدد'}
🏘️ البلدية: ${order.commune ?? 'غير محددة'}
📍 العنوان: ${order.adresse ?? 'غير محدد'}
💰 المبلغ: ${order.montant ?? 'غير محدد'} دج
📦 مرجع المنتج: ${order.produit ?? 'غير محدد'} × ${order.quantite ?? 'غير محددة'}
🔧 نوع العملية: ${typeLabel}
🏠 نوع الخدمة: ${serviceLabel}
`;
}

export async function presentOrderForConfirmation(ctx: MyContext): Promise<void> {
  const order = ctx.session.order;

  if (!order || Object.keys(order).length === 0) {
    await ctx.reply('⚠️ لا توجد بيانات طلبية جاهزة للتأكيد.');
    return;
  }

  ctx.session.step = null;

  const summary = buildOrderSummary(order);

  await ctx.replyWithMarkdown(summary);
  await ctx.reply(
    'هل ترغب بإرسال هذه الطلبية الآن إلى النظام؟',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ نعم، أرسل الطلبية', 'send_order_now')],
      [Markup.button.callback('🔙 تعديل المعلومات', 'restart_order')],
      [Markup.button.callback('❌ إلغاء العملية', 'cancel_order')],
    ])
  );
}

```

# src/bot/types/context.ts

```ts
import { Scenes } from 'telegraf';

export interface OrderData {
  type?: number;
  stop_desk?: number;
  nom_client?: string;
  telephone?: string;
  code_wilaya?: number;
  commune?: string;
  adresse?: string;
  montant?: string;
  produit?: string;
  quantite?: string;
}

export interface MySceneSession extends Scenes.SceneSessionData {
  fromWebApp?: boolean;
  order?: OrderData;
}

export interface MySession extends Scenes.SceneSession<MySceneSession> {
  order: OrderData;
  step: string | null;
}

export type MyContext = Omit<Scenes.SceneContext<MySceneSession>, 'session' | 'scene'> & {
  session: MySession;
  scene: Scenes.SceneContextScene<MyContext, MySceneSession>;
};

```

# src/bot/ui/index.ts

```ts

```

# src/config/constants.ts

```ts

```

# src/config/env.ts

```ts
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

```

# src/ecotrack/client.ts

```ts
import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const ecoClient = axios.create({
  baseURL: env.ECOTRACK_BASE_URL,
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${env.ECOTRACK_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// اعتراض الطلبات والردود للتسجيل (logging)
ecoClient.interceptors.request.use((config) => {
  logger.debug(`🌍 [API] ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

ecoClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const msg = error.response?.data?.message || error.message;
    logger.error(`❌ [API] ${msg}`);
    throw error;
  },
);

```

# src/ecotrack/endpoints.ts

```ts
import { ecoClient } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * ✅ جلب قائمة الولايات
 * المسار الصحيح: /api/v1/get/wilayas
 */
export async function getWilayas() {
  try {
    const res = await ecoClient.get('/api/v1/get/wilayas');
    if (!Array.isArray(res.data)) throw new Error('Unexpected response format');
    logger.info(`✅ Retrieved ${res.data.length} wilayas from API`);
    return res.data.map((item: any) => ({
      id: item.wilaya_id,
      nom: item.wilaya_name,
    }));
  } catch (err: any) {
    logger.error('❌ Failed to fetch wilayas: ' + err.message);
    throw err;
  }
}

/**
 * ✅ جلب قائمة البلديات (EcoTrack)
 */
export async function getCommunes(wilayaId: number) {
  try {
    const res = await ecoClient.get(`/api/v1/get/communes?wilaya_id=${wilayaId}`);
    const data = res.data;

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Empty commune list');
    }

    // ⚙️ استخراج أسماء البلديات من الحقل الصحيح
    const communes = data
      .map((item: any) =>
        item.nom || item.name || item.commune_name || item.libelle || null
      )
      .filter((name: string | null): name is string => !!name && name.trim() !== '');

    if (communes.length === 0) {
      throw new Error('No valid commune names received from API');
    }

    logger.info(`✅ Retrieved ${communes.length} communes for wilaya ${wilayaId}`);
    return communes;
  } catch (err: any) {
    logger.error(`❌ Failed to fetch communes: ${err.message}`);
    throw err;
  }
}

```

# src/ecotrack/types.ts

```ts

```

# src/services/lookup.service.ts

```ts
import NodeCache from 'node-cache';
import { getWilayas, getCommunes } from '../ecotrack/endpoints.js';
import { logger } from '../utils/logger.js';

const cache = new NodeCache({ stdTTL: 3600 });

export interface Wilaya {
  id: number;
  nom: string;
}

export async function fetchWilayasCached(): Promise<Wilaya[]> {
  const key = 'wilayas';
  const cached = cache.get(key) as Wilaya[] | undefined;
  if (cached) return cached;

  const data = await getWilayas();
  cache.set(key, data);
  logger.info(`✅ Loaded ${data.length} wilayas from API`);
  return data;
}

export async function fetchCommunesCached(wilayaId: number): Promise<string[]> {
  const key = `communes_${wilayaId}`;
  const cached = cache.get(key) as string[] | undefined;
  if (cached) return cached;

  const data = await getCommunes(wilayaId);
  cache.set(key, data);
  logger.info(`✅ Loaded ${data.length} communes for wilaya ${wilayaId}`);
  return data;
}

export { fetchWilayasCached as fetchWilayas };

```

# src/services/order.service.ts

```ts
import { ecoClient } from '../ecotrack/client.js';
import { logger } from '../utils/logger.js';

export interface CreateOrderPayload {
  nom_client: string;
  telephone: string;
  adresse: string;
  code_wilaya: number;
  commune: string;
  montant: number;
  type: number;
  stop_desk: number;
  stock: number;
  produit: string;
  quantite: string;
  remarque?: string;
}

export async function createOrder(order: CreateOrderPayload) {
  try {
    const params = new URLSearchParams();

    Object.entries(order).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });

    const url = `/api/v1/create/order?${params.toString()}`;

    logger.debug(`🌍 [API] POST ${url}`);
    const res = await ecoClient.post(url);

    logger.debug({ status: res.status, data: res.data }, '📦 [API RESPONSE]');

    if (res.data?.success) {
      const tracking = res.data.tracking || 'UNKNOWN';
      logger.info(`✅ Order created successfully → ${tracking}`);
      return {
        success: true,
        tracking,
        is_validated: res.data.is_validated ?? false,
      };
    }

    if (res.data?.errors) {
      const errorMessages = Object.entries(res.data.errors)
        .map(([key, msgs]) => `${key}: ${(msgs as string[]).join(', ')}`)
        .join('\n');
      throw new Error(`422 Validation Error:\n${errorMessages}`);
    }

    throw new Error(
      `Unexpected response from API: ${JSON.stringify(res.data, null, 2)}`
    );
  } catch (err: any) {
    if (err.response) {
      logger.error(
        { status: err.response.status, data: err.response.data },
        '❌ [API ERROR]'
      );
      throw new Error(
        `API Error (${err.response.status}): ${JSON.stringify(err.response.data)}`
      );
    }

    logger.error(`❌ Failed to create order (unexpected): ${err.message}`);
    throw new Error(err.message || 'API request failed');
  }
}


```

# src/types/global.ts

```ts

```

# src/utils/error.ts

```ts

```

# src/utils/formatters.ts

```ts

```

# src/utils/logger.ts

```ts
import pino from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  },
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
});

```

# src/validation/common.ts

```ts

```

# src/validation/order.schema.ts

```ts

```

# src/webapp/index.html

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EcoTrack WebApp</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script type="module" src="./main.js"></script>
  </body>
</html>


```

# src/webapp/main.js

```js
// سيتم جلب البيانات من API ديناميكياً
const API_BASE_URL = window.location.origin;
const DEFAULT_VALUES = {
    nom_client: '',
    telephone: '',
    type: 'delivery',
    stop_desk: 'home',
    code_wilaya: '',
    commune: '',
    adresse: '',
    montant: '',
    produit: 'insalah001',
    quantite: '1',
};
const rootElement = document.getElementById('app');
if (!rootElement) {
    throw new Error('Root element #app not found');
}
const root = rootElement;
root.innerHTML = `
  <h1 class="app-title">EcoTrack - نموذج التوصيل</h1>
  <p class="app-subtitle">أدخل بيانات الطلب، وسيتم إرسالها إلى البوت للمراجعة قبل الإرسال النهائي.</p>

  <form id="orderForm" novalidate>
    <div class="form-group" data-field="nom_client">
      <label for="nom_client">👤 اسم الزبون</label>
      <input id="nom_client" name="nom_client" class="form-control" type="text" placeholder="مثال: محمد بن أحمد" autocomplete="name" required />
      <div class="field-error" data-error-for="nom_client"></div>
    </div>

    <div class="form-group" data-field="telephone">
      <label for="telephone">📞 رقم الهاتف</label>
      <input id="telephone" name="telephone" class="form-control" type="tel" placeholder="مثال: 0660123456" autocomplete="tel" required />
      <div class="field-error" data-error-for="telephone"></div>
    </div>

    <div class="form-group" data-field="type">
      <label>🔧 نوع العملية</label>
      <div class="inline-options" role="radiogroup" aria-label="نوع العملية">
        <label class="option selected" data-option="type" data-value="delivery">
          <input type="radio" name="type" value="delivery" checked />
          <span>🚚 توصيل</span>
        </label>
        <label class="option" data-option="type" data-value="exchange">
          <input type="radio" name="type" value="exchange" />
          <span>🔄 تبديل</span>
        </label>
      </div>
      <div class="field-error" data-error-for="type"></div>
    </div>

    <div class="form-group" data-field="stop_desk">
      <label>🏠 نوع الخدمة</label>
      <div class="inline-options" role="radiogroup" aria-label="نوع الخدمة">
        <label class="option selected" data-option="stop_desk" data-value="home">
          <input type="radio" name="stop_desk" value="home" checked />
          <span>🏠 إلى المنزل</span>
        </label>
        <label class="option" data-option="stop_desk" data-value="desk">
          <input type="radio" name="stop_desk" value="desk" />
          <span>🏢 إلى المكتب (STOP DESK)</span>
        </label>
      </div>
      <div class="field-error" data-error-for="stop_desk"></div>
    </div>

    <div class="grid-two">
      <div class="form-group" data-field="code_wilaya">
        <label for="code_wilaya">🏙️ الولاية</label>
        <select id="code_wilaya" name="code_wilaya" class="form-control" required>
          <option value="">اختر الولاية</option>
        </select>
        <div class="field-error" data-error-for="code_wilaya"></div>
      </div>

      <div class="form-group" data-field="commune">
        <label for="commune">🏘️ البلدية</label>
        <select id="commune" name="commune" class="form-control" disabled required>
          <option value="">اختر البلدية</option>
        </select>
        <div class="field-error" data-error-for="commune"></div>
      </div>
    </div>

    <div class="form-group" data-field="adresse">
      <label for="adresse">📍 العنوان الكامل</label>
      <textarea id="adresse" name="adresse" class="form-control" rows="3" placeholder="مثال: حي 150 مسكن، عمارة ب، الشقة 12" required></textarea>
      <div class="field-error" data-error-for="adresse"></div>
    </div>

    <div class="grid-two">
      <div class="form-group" data-field="montant">
        <label for="montant">💰 المبلغ (دج)</label>
        <input id="montant" name="montant" class="form-control" type="number" inputmode="decimal" placeholder="مثال: 3900" min="0" step="0.01" required />
        <div class="field-error" data-error-for="montant"></div>
      </div>

      <div class="form-group" data-field="quantite">
        <label for="quantite">🔢 الكمية</label>
        <input id="quantite" name="quantite" class="form-control" type="number" inputmode="numeric" placeholder="مثال: 1" min="1" step="1" required />
        <div class="field-error" data-error-for="quantite"></div>
      </div>
    </div>

    <div class="form-group" data-field="produit" style="display: none;">
      <label for="produit">🧾 مرجع المنتج</label>
      <input id="produit" name="produit" class="form-control" type="hidden" value="insalah001" required />
      <div class="field-error" data-error-for="produit"></div>
    </div>
  </form>

  <section class="summary-card">
    <h2 class="summary-title">ملخص الطلب</h2>
    <div id="orderPreview" class="preview-list"></div>
  </section>

  <div id="formStatus" class="status hidden" role="status" aria-live="polite"></div>

  <div class="actions">
    <button type="button" class="btn btn-secondary" id="resetBtn">مسح</button>
    <button type="button" class="btn btn-primary" id="submitBtn" disabled>إرسال إلى البوت</button>
  </div>
`;
function getTelegramWebApp() {
    if (typeof window === 'undefined')
        return null;
    // محاولة الوصول بطرق مختلفة
    const tg = window.Telegram?.WebApp ||
        window.Telegram?.webApp ||
        null;
    return tg;
}
const tg = getTelegramWebApp();
if (tg) {
    try {
        tg.ready();
        tg.expand?.();
    }
    catch (error) {
        console.warn('Failed to initialize Telegram WebApp:', error);
    }
}
function requireElement(selector) {
    const element = root.querySelector(selector);
    if (!element) {
        throw new Error(`Element ${selector} not found`);
    }
    return element;
}
const form = requireElement('#orderForm');
const submitBtn = requireElement('#submitBtn');
const resetBtn = requireElement('#resetBtn');
const statusBox = requireElement('#formStatus');
const previewBox = requireElement('#orderPreview');
const controls = {
    nom_client: form.querySelector('#nom_client'),
    telephone: form.querySelector('#telephone'),
    type: Array.from(form.querySelectorAll('input[name="type"]')),
    stop_desk: Array.from(form.querySelectorAll('input[name="stop_desk"]')),
    code_wilaya: form.querySelector('#code_wilaya'),
    commune: form.querySelector('#commune'),
    adresse: form.querySelector('#adresse'),
    montant: form.querySelector('#montant'),
    produit: form.querySelector('#produit'),
    quantite: form.querySelector('#quantite'),
};
const fieldGroups = {
    nom_client: root.querySelector('[data-field="nom_client"]'),
    telephone: root.querySelector('[data-field="telephone"]'),
    type: root.querySelector('[data-field="type"]'),
    stop_desk: root.querySelector('[data-field="stop_desk"]'),
    code_wilaya: root.querySelector('[data-field="code_wilaya"]'),
    commune: root.querySelector('[data-field="commune"]'),
    adresse: root.querySelector('[data-field="adresse"]'),
    montant: root.querySelector('[data-field="montant"]'),
    produit: root.querySelector('[data-field="produit"]'),
    quantite: root.querySelector('[data-field="quantite"]'),
};
const errorNodes = {
    nom_client: root.querySelector('[data-error-for="nom_client"]'),
    telephone: root.querySelector('[data-error-for="telephone"]'),
    type: root.querySelector('[data-error-for="type"]'),
    stop_desk: root.querySelector('[data-error-for="stop_desk"]'),
    code_wilaya: root.querySelector('[data-error-for="code_wilaya"]'),
    commune: root.querySelector('[data-error-for="commune"]'),
    adresse: root.querySelector('[data-error-for="adresse"]'),
    montant: root.querySelector('[data-error-for="montant"]'),
    produit: root.querySelector('[data-error-for="produit"]'),
    quantite: root.querySelector('[data-error-for="quantite"]'),
};
const state = {
    values: { ...DEFAULT_VALUES },
    touched: new Set(),
    submitted: false,
    validation: { valid: false, errors: {} },
};
// حفظ قائمة الولايات بعد جلبها من API
let cachedWilayas = [];
const mainButtonHandler = () => handleSubmit();
const initTelegramWebApp = () => {
    const currentTg = getTelegramWebApp();
    if (currentTg) {
        try {
            currentTg.MainButton.setText('إرسال الطلب إلى البوت');
            currentTg.MainButton.hide();
            currentTg.onEvent('mainButtonClicked', mainButtonHandler);
        }
        catch (error) {
            console.warn('Failed to setup Telegram MainButton:', error);
        }
    }
};
// تهيئة فورية
initTelegramWebApp();
// إعادة المحاولة بعد تحميل الصفحة (في حالة تأخّر تحميل SDK)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTelegramWebApp);
}
else {
    setTimeout(initTelegramWebApp, 100);
}
async function populateWilayas() {
    if (!controls.code_wilaya)
        return;
    controls.code_wilaya.disabled = true;
    controls.code_wilaya.innerHTML = '<option value="">جاري التحميل...</option>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/wilayas`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data)) {
            throw new Error('Invalid API response format');
        }
        const options = ['<option value="">اختر الولاية</option>'];
        for (const wilaya of result.data) {
            options.push(`<option value="${wilaya.id}">${wilaya.nom}</option>`);
        }
        controls.code_wilaya.innerHTML = options.join('');
        controls.code_wilaya.disabled = false;
        // حفظ قائمة الولايات للاستخدام لاحقاً
        cachedWilayas = result.data;
        console.log(`✅ Loaded ${result.data.length} wilayas from API`);
    }
    catch (error) {
        console.error('Failed to fetch wilayas:', error);
        controls.code_wilaya.innerHTML = '<option value="">❌ خطأ في التحميل</option>';
        updateStatusMessage('❌ تعذر تحميل قائمة الولايات. حاول مرة أخرى.', 'error');
    }
}
async function populateCommunes(wilayaId) {
    if (!controls.commune || !wilayaId)
        return;
    controls.commune.disabled = true;
    controls.commune.innerHTML = '<option value="">جاري التحميل...</option>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/communes?wilaya_id=${wilayaId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data)) {
            throw new Error('Invalid API response format');
        }
        const options = ['<option value="">اختر البلدية</option>'];
        for (const commune of result.data) {
            options.push(`<option value="${commune}">${commune}</option>`);
        }
        controls.commune.innerHTML = options.join('');
        controls.commune.disabled = result.data.length === 0;
        state.touched.delete('commune');
        setFieldValue('commune', '', { silent: true });
        console.log(`✅ Loaded ${result.data.length} communes for wilaya ${wilayaId}`);
    }
    catch (error) {
        console.error('Failed to fetch communes:', error);
        controls.commune.innerHTML = '<option value="">❌ خطأ في التحميل</option>';
        updateStatusMessage('❌ تعذر تحميل قائمة البلديات. حاول مرة أخرى.', 'error');
    }
}
function setOptionSelected(group) {
    const selector = `[data-option="${group}"]`;
    const selectedValue = state.values[group];
    Array.from(root.querySelectorAll(selector)).forEach((label) => {
        const value = label.dataset.value;
        if (value === selectedValue) {
            label.classList.add('selected');
        }
        else {
            label.classList.remove('selected');
        }
    });
}
function setFieldValue(field, value, options = {}) {
    state.values[field] = value;
    if (options.touched) {
        state.touched.add(field);
    }
    if (!options.silent) {
        updateFormState();
    }
}
function validate(values) {
    const errors = {};
    if (!values.nom_client.trim() || values.nom_client.trim().length < 3) {
        errors.nom_client = 'الرجاء إدخال اسم الزبون (3 أحرف على الأقل).';
    }
    if (!/^\+?[0-9]{8,15}$/.test(values.telephone.trim())) {
        errors.telephone = 'رقم الهاتف غير صالح. استخدم أرقامًا فقط (8-15 رقمًا).';
    }
    if (!values.type) {
        errors.type = 'اختر نوع العملية.';
    }
    if (!values.stop_desk) {
        errors.stop_desk = 'اختر نوع الخدمة.';
    }
    if (!values.code_wilaya) {
        errors.code_wilaya = 'اختر الولاية.';
    }
    if (!values.commune) {
        errors.commune = 'اختر البلدية.';
    }
    if (!values.adresse.trim() || values.adresse.trim().length < 6) {
        errors.adresse = 'الرجاء إدخال عنوان واضح ومفصل (6 أحرف على الأقل).';
    }
    const montantNumber = Number(values.montant);
    if (!values.montant || Number.isNaN(montantNumber) || montantNumber <= 0) {
        errors.montant = 'أدخل مبلغًا صالحًا أكبر من 0.';
    }
    // مرجع المنتج ثابت، لكن نتحقق من وجوده وصحته
    const produitValue = (values.produit || 'insalah001').trim();
    if (!produitValue || !/^[A-Za-z0-9._-]{2,64}$/.test(produitValue)) {
        errors.produit = 'مرجع المنتج يجب أن يحتوي على حروف/أرقام ويمكن أن يتضمن _ أو - أو .';
    }
    const quantityNumber = Number(values.quantite);
    if (!values.quantite || !Number.isInteger(quantityNumber) || quantityNumber <= 0) {
        errors.quantite = 'الكمية يجب أن تكون رقمًا صحيحًا أكبر من 0.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
}
function updateStatusMessage(message, type) {
    statusBox.textContent = message;
    statusBox.classList.remove('hidden', 'status-error', 'status-success', 'status-info');
    statusBox.classList.add('status', `status-${type}`);
}
function clearStatusMessage() {
    statusBox.textContent = '';
    statusBox.classList.add('hidden');
}
function getWilayaName(id) {
    const wilayaId = Number(id);
    return cachedWilayas.find((w) => w.id === wilayaId)?.nom ?? '';
}
function updatePreview() {
    const values = state.values;
    previewBox.innerHTML = `
    <ul>
      <li><span>👤 الزبون:</span> ${values.nom_client || '—'}</li>
      <li><span>📞 الهاتف:</span> ${values.telephone || '—'}</li>
      <li><span>🔧 العملية:</span> ${values.type === 'delivery' ? 'توصيل' : 'تبديل'}</li>
      <li><span>🏠 الخدمة:</span> ${values.stop_desk === 'home' ? 'إلى المنزل' : 'إلى المكتب'}</li>
      <li><span>🏙️ الولاية:</span> ${getWilayaName(values.code_wilaya) || '—'}</li>
      <li><span>🏘️ البلدية:</span> ${values.commune || '—'}</li>
      <li><span>📍 العنوان:</span> ${values.adresse || '—'}</li>
      <li><span>💰 المبلغ:</span> ${values.montant ? `${values.montant} دج` : '—'}</li>
      <li><span>🧾 المنتج:</span> ${values.produit || '—'}</li>
      <li><span>🔢 الكمية:</span> ${values.quantite || '—'}</li>
    </ul>
  `;
}
function updateFormState() {
    state.validation = validate(state.values);
    const { valid, errors } = state.validation;
    for (const field of Object.keys(fieldGroups)) {
        const group = fieldGroups[field];
        const errorNode = errorNodes[field];
        const errorMessage = errors[field];
        const shouldShowError = Boolean(errorMessage) && (state.touched.has(field) || state.submitted);
        if (group) {
            if (shouldShowError) {
                group.classList.add('invalid');
            }
            else {
                group.classList.remove('invalid');
            }
        }
        if (errorNode) {
            errorNode.textContent = shouldShowError ? errorMessage ?? '' : '';
        }
    }
    if (state.submitted) {
        if (valid) {
            updateStatusMessage('البيانات جاهزة للإرسال إلى البوت.', 'success');
        }
        else {
            const firstError = Object.entries(errors).find(([field, message]) => {
                return Boolean(message) && (state.touched.has(field) || state.submitted);
            });
            if (firstError) {
                updateStatusMessage(firstError[1] ?? 'تحقق من الحقول المطلوبة.', 'error');
            }
        }
    }
    else if (state.touched.size > 0) {
        if (valid) {
            updateStatusMessage('كل شيء جاهز. يمكنك الإرسال.', 'success');
        }
        else {
            updateStatusMessage('يرجى إكمال الحقول المطلوبة.', 'info');
        }
    }
    else {
        clearStatusMessage();
    }
    submitBtn.disabled = !valid;
    const currentTg = getTelegramWebApp();
    if (currentTg) {
        if (valid) {
            currentTg.MainButton.setText('إرسال الطلب إلى البوت');
            currentTg.MainButton.enable();
            currentTg.MainButton.show();
        }
        else {
            currentTg.MainButton.disable();
            currentTg.MainButton.hide();
        }
    }
    updatePreview();
}
function handleSubmit() {
    state.submitted = true;
    updateFormState();
    if (!state.validation.valid) {
        return;
    }
    const payload = {
        nom_client: state.values.nom_client.trim(),
        telephone: state.values.telephone.trim(),
        type: state.values.type === 'delivery' ? 1 : 2,
        stop_desk: state.values.stop_desk === 'home' ? 0 : 1,
        code_wilaya: Number(state.values.code_wilaya),
        commune: state.values.commune,
        adresse: state.values.adresse.trim(),
        montant: Number(state.values.montant),
        produit: state.values.produit.trim(),
        quantite: Number(state.values.quantite),
    };
    const dataToSend = JSON.stringify({
        kind: 'create-order',
        data: payload,
    });
    // تحقق محسّن من Telegram WebApp
    const currentTg = getTelegramWebApp();
    console.log('Telegram WebApp available?', !!currentTg);
    console.log('Window.Telegram:', window.Telegram);
    console.log('Payload to send:', dataToSend);
    try {
        if (currentTg && typeof currentTg.sendData === 'function') {
            console.log('Sending data via Telegram WebApp...');
            currentTg.MainButton?.showProgress?.();
            currentTg.sendData(dataToSend);
            console.log('Data sent successfully!');
            updateStatusMessage('✅ تم إرسال البيانات إلى البوت. راجع المحادثة لإكمال الطلب.', 'success');
            // إغلاق الواجهة بعد إرسال ناجح (اختياري)
            setTimeout(() => {
                currentTg.close?.();
            }, 1500);
        }
        else {
            console.warn('Telegram WebApp not available, using test mode');
            updateStatusMessage('⚠️ وضع الاختبار: لم يتم العثور على Telegram WebApp.', 'info');
            console.table(payload);
            console.log('Payload JSON:', dataToSend);
            // في وضع الاختبار، اعرض معلومات مفيدة
            if (confirm('وضع الاختبار: البيانات جاهزة.\n\nافتح الواجهة من داخل تيليجرام للإرسال الحقيقي.\n\nهل تريد عرض البيانات؟')) {
                alert('Payload:\n' + dataToSend);
            }
        }
    }
    catch (error) {
        console.error('Failed to send data', error);
        updateStatusMessage('❌ تعذر إرسال البيانات إلى البوت. حاول مرة أخرى.', 'error');
    }
    finally {
        currentTg?.MainButton?.hideProgress?.();
    }
}
function resetForm() {
    state.values = { ...DEFAULT_VALUES };
    // التأكد من ضبط مرجع المنتج الثابت
    state.values.produit = 'insalah001';
    state.touched.clear();
    state.submitted = false;
    if (controls.nom_client)
        controls.nom_client.value = DEFAULT_VALUES.nom_client;
    if (controls.telephone)
        controls.telephone.value = DEFAULT_VALUES.telephone;
    if (controls.adresse)
        controls.adresse.value = DEFAULT_VALUES.adresse;
    if (controls.montant)
        controls.montant.value = DEFAULT_VALUES.montant;
    if (controls.produit)
        controls.produit.value = 'insalah001'; // قيمة ثابتة
    if (controls.quantite)
        controls.quantite.value = DEFAULT_VALUES.quantite;
    if (controls.code_wilaya)
        controls.code_wilaya.value = DEFAULT_VALUES.code_wilaya;
    populateCommunes(DEFAULT_VALUES.code_wilaya).catch((err) => console.error('Failed to populate communes:', err));
    setOptionSelected('type');
    setOptionSelected('stop_desk');
    clearStatusMessage();
    updateFormState();
}
// تعيين مرجع المنتج الثابت قبل أي شيء آخر
state.values.produit = 'insalah001';
if (controls.produit) {
    controls.produit.value = 'insalah001';
}
populateWilayas().catch((err) => console.error('Failed to populate wilayas:', err));
populateCommunes(DEFAULT_VALUES.code_wilaya).catch((err) => console.error('Failed to populate communes:', err));
setOptionSelected('type');
setOptionSelected('stop_desk');
updatePreview();
updateFormState(); // تحديث حالة النموذج بعد ضبط جميع القيم
controls.nom_client?.addEventListener('input', (event) => {
    const value = event.target.value;
    setFieldValue('nom_client', value, { touched: true });
});
controls.telephone?.addEventListener('input', (event) => {
    const value = event.target.value;
    setFieldValue('telephone', value, { touched: true });
});
for (const radio of controls.type ?? []) {
    radio.addEventListener('change', (event) => {
        const value = event.target.value;
        if (event.target.checked) {
            setFieldValue('type', value, { touched: true });
            setOptionSelected('type');
        }
    });
}
for (const radio of controls.stop_desk ?? []) {
    radio.addEventListener('change', (event) => {
        const value = event.target.value;
        if (event.target.checked) {
            setFieldValue('stop_desk', value, { touched: true });
            setOptionSelected('stop_desk');
        }
    });
}
controls.code_wilaya?.addEventListener('change', async (event) => {
    const value = event.target.value;
    setFieldValue('code_wilaya', value, { touched: true });
    await populateCommunes(value);
    updateFormState();
});
controls.commune?.addEventListener('change', (event) => {
    const value = event.target.value;
    setFieldValue('commune', value, { touched: true });
});
controls.adresse?.addEventListener('input', (event) => {
    const value = event.target.value;
    setFieldValue('adresse', value, { touched: true });
});
controls.montant?.addEventListener('input', (event) => {
    const value = event.target.value;
    setFieldValue('montant', value, { touched: true });
});
controls.produit?.addEventListener('input', (event) => {
    const value = event.target.value;
    setFieldValue('produit', value, { touched: true });
});
controls.quantite?.addEventListener('input', (event) => {
    const value = event.target.value;
    setFieldValue('quantite', value, { touched: true });
});
submitBtn.addEventListener('click', () => {
    handleSubmit();
});
form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSubmit();
});
resetBtn.addEventListener('click', () => {
    resetForm();
});
updateFormState();
window.addEventListener('beforeunload', () => {
    const currentTg = getTelegramWebApp();
    if (currentTg) {
        currentTg.offEvent('mainButtonClicked', mainButtonHandler);
    }
});
export {};

```

# src/webapp/main.ts

```ts
type OrderType = 'delivery' | 'exchange';
type StopDeskType = 'home' | 'desk';

interface OrderFormValues {
  nom_client: string;
  telephone: string;
  type: OrderType;
  stop_desk: StopDeskType;
  code_wilaya: string;
  commune: string;
  adresse: string;
  montant: string;
  produit: string;
  quantite: string;
}

interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof OrderFormValues, string>>;
}

interface WilayaOption {
  id: string;
  nom: string;
  communes: string[];
}

interface TelegramWebAppMainButton {
  text: string;
  isVisible: boolean;
  setText(text: string): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  showProgress?(leaveActive?: boolean): void;
  hideProgress?(): void;
  setParams?(params: { text?: string; color?: string; text_color?: string }): void;
}

interface TelegramWebApp {
  ready(): void;
  close(): void;
  sendData(data: string): void;
  expand?(): void;
  MainButton: TelegramWebAppMainButton;
  BackButton?: {
    show(): void;
    hide(): void;
    onClick?(cb: () => void): void;
  };
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  onEvent(event: 'mainButtonClicked', handler: () => void): void;
  offEvent(event: 'mainButtonClicked', handler: () => void): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

// سيتم جلب البيانات من API ديناميكياً
const API_BASE_URL = window.location.origin;

interface WilayaApiResponse {
  success: boolean;
  data: Array<{ id: number; nom: string }>;
}

interface CommunesApiResponse {
  success: boolean;
  data: string[];
}

const DEFAULT_VALUES: OrderFormValues = {
  nom_client: '',
  telephone: '',
  type: 'delivery',
  stop_desk: 'home',
  code_wilaya: '',
  commune: '',
  adresse: '',
  montant: '',
  produit: 'insalah001',
  quantite: '1',
};

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Root element #app not found');
}

const root = rootElement;

root.innerHTML = `
  <h1 class="app-title">EcoTrack - نموذج التوصيل</h1>
  <p class="app-subtitle">أدخل بيانات الطلب، وسيتم إرسالها إلى البوت للمراجعة قبل الإرسال النهائي.</p>

  <form id="orderForm" novalidate>
    <div class="form-group" data-field="nom_client">
      <label for="nom_client">👤 اسم الزبون</label>
      <input id="nom_client" name="nom_client" class="form-control" type="text" placeholder="مثال: محمد بن أحمد" autocomplete="name" required />
      <div class="field-error" data-error-for="nom_client"></div>
    </div>

    <div class="form-group" data-field="telephone">
      <label for="telephone">📞 رقم الهاتف</label>
      <input id="telephone" name="telephone" class="form-control" type="tel" placeholder="مثال: 0660123456" autocomplete="tel" required />
      <div class="field-error" data-error-for="telephone"></div>
    </div>

    <div class="form-group" data-field="type">
      <label>🔧 نوع العملية</label>
      <div class="inline-options" role="radiogroup" aria-label="نوع العملية">
        <label class="option selected" data-option="type" data-value="delivery">
          <input type="radio" name="type" value="delivery" checked />
          <span>🚚 توصيل</span>
        </label>
        <label class="option" data-option="type" data-value="exchange">
          <input type="radio" name="type" value="exchange" />
          <span>🔄 تبديل</span>
        </label>
      </div>
      <div class="field-error" data-error-for="type"></div>
    </div>

    <div class="form-group" data-field="stop_desk">
      <label>🏠 نوع الخدمة</label>
      <div class="inline-options" role="radiogroup" aria-label="نوع الخدمة">
        <label class="option selected" data-option="stop_desk" data-value="home">
          <input type="radio" name="stop_desk" value="home" checked />
          <span>🏠 إلى المنزل</span>
        </label>
        <label class="option" data-option="stop_desk" data-value="desk">
          <input type="radio" name="stop_desk" value="desk" />
          <span>🏢 إلى المكتب (STOP DESK)</span>
        </label>
      </div>
      <div class="field-error" data-error-for="stop_desk"></div>
    </div>

    <div class="grid-two">
      <div class="form-group" data-field="code_wilaya">
        <label for="code_wilaya">🏙️ الولاية</label>
        <select id="code_wilaya" name="code_wilaya" class="form-control" required>
          <option value="">اختر الولاية</option>
        </select>
        <div class="field-error" data-error-for="code_wilaya"></div>
      </div>

      <div class="form-group" data-field="commune">
        <label for="commune">🏘️ البلدية</label>
        <select id="commune" name="commune" class="form-control" disabled required>
          <option value="">اختر البلدية</option>
        </select>
        <div class="field-error" data-error-for="commune"></div>
      </div>
    </div>

    <div class="form-group" data-field="adresse">
      <label for="adresse">📍 العنوان الكامل</label>
      <textarea id="adresse" name="adresse" class="form-control" rows="3" placeholder="مثال: حي 150 مسكن، عمارة ب، الشقة 12" required></textarea>
      <div class="field-error" data-error-for="adresse"></div>
    </div>

    <div class="grid-two">
      <div class="form-group" data-field="montant">
        <label for="montant">💰 المبلغ (دج)</label>
        <input id="montant" name="montant" class="form-control" type="number" inputmode="decimal" placeholder="مثال: 3900" min="0" step="0.01" required />
        <div class="field-error" data-error-for="montant"></div>
      </div>

      <div class="form-group" data-field="quantite">
        <label for="quantite">🔢 الكمية</label>
        <input id="quantite" name="quantite" class="form-control" type="number" inputmode="numeric" placeholder="مثال: 1" min="1" step="1" required />
        <div class="field-error" data-error-for="quantite"></div>
      </div>
    </div>

    <div class="form-group" data-field="produit" style="display: none;">
      <label for="produit">🧾 مرجع المنتج</label>
      <input id="produit" name="produit" class="form-control" type="hidden" value="insalah001" required />
      <div class="field-error" data-error-for="produit"></div>
    </div>
  </form>

  <section class="summary-card">
    <h2 class="summary-title">ملخص الطلب</h2>
    <div id="orderPreview" class="preview-list"></div>
  </section>

  <div id="formStatus" class="status hidden" role="status" aria-live="polite"></div>

  <div class="actions">
    <button type="button" class="btn btn-secondary" id="resetBtn">مسح</button>
    <button type="button" class="btn btn-primary" id="submitBtn" disabled>إرسال إلى البوت</button>
  </div>
`;

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  
  // محاولة الوصول بطرق مختلفة
  const tg = (window as any).Telegram?.WebApp || 
             (window as any).Telegram?.webApp ||
             null;
  
  return tg;
}

const tg = getTelegramWebApp();

if (tg) {
  try {
    tg.ready();
    tg.expand?.();
  } catch (error) {
    console.warn('Failed to initialize Telegram WebApp:', error);
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Element ${selector} not found`);
  }
  return element as T;
}

const form = requireElement<HTMLFormElement>('#orderForm');
const submitBtn = requireElement<HTMLButtonElement>('#submitBtn');
const resetBtn = requireElement<HTMLButtonElement>('#resetBtn');
const statusBox = requireElement<HTMLDivElement>('#formStatus');
const previewBox = requireElement<HTMLDivElement>('#orderPreview');

const controls = {
  nom_client: form.querySelector<HTMLInputElement>('#nom_client'),
  telephone: form.querySelector<HTMLInputElement>('#telephone'),
  type: Array.from(form.querySelectorAll<HTMLInputElement>('input[name="type"]')),
  stop_desk: Array.from(form.querySelectorAll<HTMLInputElement>('input[name="stop_desk"]')),
  code_wilaya: form.querySelector<HTMLSelectElement>('#code_wilaya'),
  commune: form.querySelector<HTMLSelectElement>('#commune'),
  adresse: form.querySelector<HTMLTextAreaElement>('#adresse'),
  montant: form.querySelector<HTMLInputElement>('#montant'),
  produit: form.querySelector<HTMLInputElement>('#produit'),
  quantite: form.querySelector<HTMLInputElement>('#quantite'),
};

const fieldGroups: Record<keyof OrderFormValues, HTMLElement | null> = {
  nom_client: root.querySelector('[data-field="nom_client"]'),
  telephone: root.querySelector('[data-field="telephone"]'),
  type: root.querySelector('[data-field="type"]'),
  stop_desk: root.querySelector('[data-field="stop_desk"]'),
  code_wilaya: root.querySelector('[data-field="code_wilaya"]'),
  commune: root.querySelector('[data-field="commune"]'),
  adresse: root.querySelector('[data-field="adresse"]'),
  montant: root.querySelector('[data-field="montant"]'),
  produit: root.querySelector('[data-field="produit"]'),
  quantite: root.querySelector('[data-field="quantite"]'),
};

const errorNodes: Record<keyof OrderFormValues, HTMLDivElement | null> = {
  nom_client: root.querySelector('[data-error-for="nom_client"]'),
  telephone: root.querySelector('[data-error-for="telephone"]'),
  type: root.querySelector('[data-error-for="type"]'),
  stop_desk: root.querySelector('[data-error-for="stop_desk"]'),
  code_wilaya: root.querySelector('[data-error-for="code_wilaya"]'),
  commune: root.querySelector('[data-error-for="commune"]'),
  adresse: root.querySelector('[data-error-for="adresse"]'),
  montant: root.querySelector('[data-error-for="montant"]'),
  produit: root.querySelector('[data-error-for="produit"]'),
  quantite: root.querySelector('[data-error-for="quantite"]'),
};

const state = {
  values: { ...DEFAULT_VALUES },
  touched: new Set<keyof OrderFormValues>(),
  submitted: false,
  validation: { valid: false, errors: {} as ValidationResult['errors'] },
};

// حفظ قائمة الولايات بعد جلبها من API
let cachedWilayas: Array<{ id: number; nom: string }> = [];

const mainButtonHandler = () => handleSubmit();

const initTelegramWebApp = () => {
  const currentTg = getTelegramWebApp();
  if (currentTg) {
    try {
      currentTg.MainButton.setText('إرسال الطلب إلى البوت');
      currentTg.MainButton.hide();
      currentTg.onEvent('mainButtonClicked', mainButtonHandler);
    } catch (error) {
      console.warn('Failed to setup Telegram MainButton:', error);
    }
  }
};

// تهيئة فورية
initTelegramWebApp();

// إعادة المحاولة بعد تحميل الصفحة (في حالة تأخّر تحميل SDK)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTelegramWebApp);
} else {
  setTimeout(initTelegramWebApp, 100);
}

async function populateWilayas() {
  if (!controls.code_wilaya) return;
  
  controls.code_wilaya.disabled = true;
  controls.code_wilaya.innerHTML = '<option value="">جاري التحميل...</option>';
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/wilayas`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: WilayaApiResponse = await response.json();
    
    if (!result.success || !Array.isArray(result.data)) {
      throw new Error('Invalid API response format');
    }
    
    const options = ['<option value="">اختر الولاية</option>'];
    for (const wilaya of result.data) {
      options.push(`<option value="${wilaya.id}">${wilaya.nom}</option>`);
    }
    
    controls.code_wilaya.innerHTML = options.join('');
    controls.code_wilaya.disabled = false;
    
    // حفظ قائمة الولايات للاستخدام لاحقاً
    cachedWilayas = result.data;
    
    console.log(`✅ Loaded ${result.data.length} wilayas from API`);
  } catch (error) {
    console.error('Failed to fetch wilayas:', error);
    controls.code_wilaya.innerHTML = '<option value="">❌ خطأ في التحميل</option>';
    updateStatusMessage('❌ تعذر تحميل قائمة الولايات. حاول مرة أخرى.', 'error');
  }
}

async function populateCommunes(wilayaId: string) {
  if (!controls.commune || !wilayaId) return;
  
  controls.commune.disabled = true;
  controls.commune.innerHTML = '<option value="">جاري التحميل...</option>';
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/communes?wilaya_id=${wilayaId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result: CommunesApiResponse = await response.json();
    
    if (!result.success || !Array.isArray(result.data)) {
      throw new Error('Invalid API response format');
    }
    
    const options = ['<option value="">اختر البلدية</option>'];
    for (const commune of result.data) {
      options.push(`<option value="${commune}">${commune}</option>`);
    }
    
    controls.commune.innerHTML = options.join('');
    controls.commune.disabled = result.data.length === 0;
    state.touched.delete('commune');
    setFieldValue('commune', '', { silent: true });
    
    console.log(`✅ Loaded ${result.data.length} communes for wilaya ${wilayaId}`);
  } catch (error) {
    console.error('Failed to fetch communes:', error);
    controls.commune.innerHTML = '<option value="">❌ خطأ في التحميل</option>';
    updateStatusMessage('❌ تعذر تحميل قائمة البلديات. حاول مرة أخرى.', 'error');
  }
}

function setOptionSelected(group: 'type' | 'stop_desk') {
  const selector = `[data-option="${group}"]`;
  const selectedValue = state.values[group];
  Array.from(root.querySelectorAll<HTMLLabelElement>(selector)).forEach((label) => {
    const value = label.dataset.value as OrderType | StopDeskType;
    if (value === selectedValue) {
      label.classList.add('selected');
    } else {
      label.classList.remove('selected');
    }
  });
}

function setFieldValue<K extends keyof OrderFormValues>(
  field: K,
  value: OrderFormValues[K],
  options: { touched?: boolean; silent?: boolean } = {}
) {
  state.values[field] = value;
  if (options.touched) {
    state.touched.add(field);
  }
  if (!options.silent) {
    updateFormState();
  }
}

function validate(values: OrderFormValues): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  if (!values.nom_client.trim() || values.nom_client.trim().length < 3) {
    errors.nom_client = 'الرجاء إدخال اسم الزبون (3 أحرف على الأقل).';
  }

  if (!/^\+?[0-9]{8,15}$/.test(values.telephone.trim())) {
    errors.telephone = 'رقم الهاتف غير صالح. استخدم أرقامًا فقط (8-15 رقمًا).';
  }

  if (!values.type) {
    errors.type = 'اختر نوع العملية.';
  }

  if (!values.stop_desk) {
    errors.stop_desk = 'اختر نوع الخدمة.';
  }

  if (!values.code_wilaya) {
    errors.code_wilaya = 'اختر الولاية.';
  }

  if (!values.commune) {
    errors.commune = 'اختر البلدية.';
  }

  if (!values.adresse.trim() || values.adresse.trim().length < 6) {
    errors.adresse = 'الرجاء إدخال عنوان واضح ومفصل (6 أحرف على الأقل).';
  }

  const montantNumber = Number(values.montant);
  if (!values.montant || Number.isNaN(montantNumber) || montantNumber <= 0) {
    errors.montant = 'أدخل مبلغًا صالحًا أكبر من 0.';
  }

  // مرجع المنتج ثابت، لكن نتحقق من وجوده وصحته
  const produitValue = (values.produit || 'insalah001').trim();
  if (!produitValue || !/^[A-Za-z0-9._-]{2,64}$/.test(produitValue)) {
    errors.produit = 'مرجع المنتج يجب أن يحتوي على حروف/أرقام ويمكن أن يتضمن _ أو - أو .';
  }

  const quantityNumber = Number(values.quantite);
  if (!values.quantite || !Number.isInteger(quantityNumber) || quantityNumber <= 0) {
    errors.quantite = 'الكمية يجب أن تكون رقمًا صحيحًا أكبر من 0.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function updateStatusMessage(message: string, type: 'info' | 'error' | 'success') {
  statusBox.textContent = message;
  statusBox.classList.remove('hidden', 'status-error', 'status-success', 'status-info');
  statusBox.classList.add('status', `status-${type}`);
}

function clearStatusMessage() {
  statusBox.textContent = '';
  statusBox.classList.add('hidden');
}

function getWilayaName(id: string) {
  const wilayaId = Number(id);
  return cachedWilayas.find((w) => w.id === wilayaId)?.nom ?? '';
}

function updatePreview() {
  const values = state.values;
  previewBox.innerHTML = `
    <ul>
      <li><span>👤 الزبون:</span> ${values.nom_client || '—'}</li>
      <li><span>📞 الهاتف:</span> ${values.telephone || '—'}</li>
      <li><span>🔧 العملية:</span> ${values.type === 'delivery' ? 'توصيل' : 'تبديل'}</li>
      <li><span>🏠 الخدمة:</span> ${values.stop_desk === 'home' ? 'إلى المنزل' : 'إلى المكتب'}</li>
      <li><span>🏙️ الولاية:</span> ${getWilayaName(values.code_wilaya) || '—'}</li>
      <li><span>🏘️ البلدية:</span> ${values.commune || '—'}</li>
      <li><span>📍 العنوان:</span> ${values.adresse || '—'}</li>
      <li><span>💰 المبلغ:</span> ${values.montant ? `${values.montant} دج` : '—'}</li>
      <li><span>🧾 المنتج:</span> ${values.produit || '—'}</li>
      <li><span>🔢 الكمية:</span> ${values.quantite || '—'}</li>
    </ul>
  `;
}

function updateFormState() {
  state.validation = validate(state.values);
  const { valid, errors } = state.validation;

  for (const field of Object.keys(fieldGroups) as (keyof OrderFormValues)[]) {
    const group = fieldGroups[field];
    const errorNode = errorNodes[field];
    const errorMessage = errors[field];
    const shouldShowError = Boolean(errorMessage) && (state.touched.has(field) || state.submitted);

    if (group) {
      if (shouldShowError) {
        group.classList.add('invalid');
      } else {
        group.classList.remove('invalid');
      }
    }

    if (errorNode) {
      errorNode.textContent = shouldShowError ? errorMessage ?? '' : '';
    }
  }

  if (state.submitted) {
    if (valid) {
      updateStatusMessage('البيانات جاهزة للإرسال إلى البوت.', 'success');
    } else {
      const firstError = Object.entries(errors).find(([field, message]) => {
        return Boolean(message) && (state.touched.has(field as keyof OrderFormValues) || state.submitted);
      });
      if (firstError) {
        updateStatusMessage(firstError[1] ?? 'تحقق من الحقول المطلوبة.', 'error');
      }
    }
  } else if (state.touched.size > 0) {
    if (valid) {
      updateStatusMessage('كل شيء جاهز. يمكنك الإرسال.', 'success');
    } else {
      updateStatusMessage('يرجى إكمال الحقول المطلوبة.', 'info');
    }
  } else {
    clearStatusMessage();
  }

  submitBtn.disabled = !valid;

  const currentTg = getTelegramWebApp();
  if (currentTg) {
    if (valid) {
      currentTg.MainButton.setText('إرسال الطلب إلى البوت');
      currentTg.MainButton.enable();
      currentTg.MainButton.show();
    } else {
      currentTg.MainButton.disable();
      currentTg.MainButton.hide();
    }
  }

  updatePreview();
}

function handleSubmit() {
  state.submitted = true;
  updateFormState();

  if (!state.validation.valid) {
    return;
  }

  const payload = {
    nom_client: state.values.nom_client.trim(),
    telephone: state.values.telephone.trim(),
    type: state.values.type === 'delivery' ? 1 : 2,
    stop_desk: state.values.stop_desk === 'home' ? 0 : 1,
    code_wilaya: Number(state.values.code_wilaya),
    commune: state.values.commune,
    adresse: state.values.adresse.trim(),
    montant: Number(state.values.montant),
    produit: state.values.produit.trim(),
    quantite: Number(state.values.quantite),
  };

  const dataToSend = JSON.stringify({
    kind: 'create-order',
    data: payload,
  });

  // تحقق محسّن من Telegram WebApp
  const currentTg = getTelegramWebApp();

  console.log('Telegram WebApp available?', !!currentTg);
  console.log('Window.Telegram:', (window as any).Telegram);
  console.log('Payload to send:', dataToSend);

  try {
    if (currentTg && typeof currentTg.sendData === 'function') {
      console.log('Sending data via Telegram WebApp...');
      currentTg.MainButton?.showProgress?.();
      
      currentTg.sendData(dataToSend);
      
      console.log('Data sent successfully!');
      updateStatusMessage('✅ تم إرسال البيانات إلى البوت. راجع المحادثة لإكمال الطلب.', 'success');
      
      // إغلاق الواجهة بعد إرسال ناجح (اختياري)
      setTimeout(() => {
        currentTg.close?.();
      }, 1500);
    } else {
      console.warn('Telegram WebApp not available, using test mode');
      updateStatusMessage('⚠️ وضع الاختبار: لم يتم العثور على Telegram WebApp.', 'info');
      console.table(payload);
      console.log('Payload JSON:', dataToSend);
      
      // في وضع الاختبار، اعرض معلومات مفيدة
      if (confirm('وضع الاختبار: البيانات جاهزة.\n\nافتح الواجهة من داخل تيليجرام للإرسال الحقيقي.\n\nهل تريد عرض البيانات؟')) {
        alert('Payload:\n' + dataToSend);
      }
    }
  } catch (error) {
    console.error('Failed to send data', error);
    updateStatusMessage('❌ تعذر إرسال البيانات إلى البوت. حاول مرة أخرى.', 'error');
  } finally {
    currentTg?.MainButton?.hideProgress?.();
  }
}

function resetForm() {
  state.values = { ...DEFAULT_VALUES };
  // التأكد من ضبط مرجع المنتج الثابت
  state.values.produit = 'insalah001';
  state.touched.clear();
  state.submitted = false;

  if (controls.nom_client) controls.nom_client.value = DEFAULT_VALUES.nom_client;
  if (controls.telephone) controls.telephone.value = DEFAULT_VALUES.telephone;
  if (controls.adresse) controls.adresse.value = DEFAULT_VALUES.adresse;
  if (controls.montant) controls.montant.value = DEFAULT_VALUES.montant;
  if (controls.produit) controls.produit.value = 'insalah001'; // قيمة ثابتة
  if (controls.quantite) controls.quantite.value = DEFAULT_VALUES.quantite;
  if (controls.code_wilaya) controls.code_wilaya.value = DEFAULT_VALUES.code_wilaya;
  populateCommunes(DEFAULT_VALUES.code_wilaya).catch((err) => console.error('Failed to populate communes:', err));
  setOptionSelected('type');
  setOptionSelected('stop_desk');
  clearStatusMessage();
  updateFormState();
}

// تعيين مرجع المنتج الثابت قبل أي شيء آخر
state.values.produit = 'insalah001';
if (controls.produit) {
  controls.produit.value = 'insalah001';
}

populateWilayas().catch((err) => console.error('Failed to populate wilayas:', err));
populateCommunes(DEFAULT_VALUES.code_wilaya).catch((err) => console.error('Failed to populate communes:', err));
setOptionSelected('type');
setOptionSelected('stop_desk');
updatePreview();
updateFormState(); // تحديث حالة النموذج بعد ضبط جميع القيم

controls.nom_client?.addEventListener('input', (event) => {
  const value = (event.target as HTMLInputElement).value;
  setFieldValue('nom_client', value, { touched: true });
});

controls.telephone?.addEventListener('input', (event) => {
  const value = (event.target as HTMLInputElement).value;
  setFieldValue('telephone', value, { touched: true });
});

for (const radio of controls.type ?? []) {
  radio.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value as OrderType;
    if ((event.target as HTMLInputElement).checked) {
      setFieldValue('type', value, { touched: true });
      setOptionSelected('type');
    }
  });
}

for (const radio of controls.stop_desk ?? []) {
  radio.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value as StopDeskType;
    if ((event.target as HTMLInputElement).checked) {
      setFieldValue('stop_desk', value, { touched: true });
      setOptionSelected('stop_desk');
    }
  });
}

controls.code_wilaya?.addEventListener('change', async (event) => {
  const value = (event.target as HTMLSelectElement).value;
  setFieldValue('code_wilaya', value, { touched: true });
  await populateCommunes(value);
  updateFormState();
});

controls.commune?.addEventListener('change', (event) => {
  const value = (event.target as HTMLSelectElement).value;
  setFieldValue('commune', value, { touched: true });
});

controls.adresse?.addEventListener('input', (event) => {
  const value = (event.target as HTMLTextAreaElement).value;
  setFieldValue('adresse', value, { touched: true });
});

controls.montant?.addEventListener('input', (event) => {
  const value = (event.target as HTMLInputElement).value;
  setFieldValue('montant', value, { touched: true });
});

controls.produit?.addEventListener('input', (event) => {
  const value = (event.target as HTMLInputElement).value;
  setFieldValue('produit', value, { touched: true });
});

controls.quantite?.addEventListener('input', (event) => {
  const value = (event.target as HTMLInputElement).value;
  setFieldValue('quantite', value, { touched: true });
});

submitBtn.addEventListener('click', () => {
  handleSubmit();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  handleSubmit();
});

resetBtn.addEventListener('click', () => {
  resetForm();
});

updateFormState();

window.addEventListener('beforeunload', () => {
  const currentTg = getTelegramWebApp();
  if (currentTg) {
    currentTg.offEvent('mainButtonClicked', mainButtonHandler);
  }
});

export {};


```

# src/webapp/README.md

```md
# EcoTrack Telegram Web App

واجهة ويب خفيفة لإنشاء طلبات التوصيل عبر تيليجرام.

## التشغيل المحلي

\`\`\`bash
# تحويل TypeScript إلى JavaScript
npm run webapp:build

# تشغيل خادم محلي للمعاينة
npm run webapp:serve
\`\`\`

سيفتح الخادم على `http://localhost:3000`

## الربط مع البوت

### 1. استضافة الواجهة

للاختبار المحلي:
\`\`\`bash
# تشغيل الخادم المحلي
npm run webapp:serve

# في نافذة أخرى، تشغيل ngrok
npx ngrok http 3000
\`\`\`

دوّن رابط ngrok (مثل `https://xxxx.ngrok.io`)

### 2. تهيئة متغيرات البيئة

أضف في ملف `.env`:
\`\`\`env
WEB_APP_URL=https://xxxx.ngrok.io
\`\`\`

### 3. إعادة تشغيل البوت

\`\`\`bash
npm run dev
\`\`\`

### 4. اختبار الواجهة

1. افتح البوت في تيليجرام
2. اضغط `/start`
3. اضغط زر "🖥️ واجهة الطلبات" (سيظهر فقط إذا كان `WEB_APP_URL` مضبوطًا)
4. املأ النموذج في الواجهة
5. اضغط "إرسال الطلب إلى البوت"
6. راجع الملخص في البوت واضغط "تأكيد" للإرسال النهائي

## البنية

- `index.html` - صفحة HTML الرئيسية
- `main.ts` - منطق التطبيق (TypeScript)
- `main.js` - نسخة JavaScript المُحوّلة (تُنشأ تلقائيًا)
- `styles.css` - تنسيقات الواجهة

## ملاحظات

- الواجهة تعمل فقط داخل تيليجرام (تحتاج `Telegram.WebApp` API)
- عند الفتح في متصفح عادي، ستظهر رسالة "وضع الاختبار"
- بيانات الولايات/البلديات حاليًا نماذج ثابتة (يمكن ربطها بـ API لاحقًا)


```

# src/webapp/styles.css

```css
:root {
  color-scheme: light dark;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

body {
  margin: 0;
  background-color: #0c111f;
  color: #f2f4f9;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

#app {
  width: min(420px, 92vw);
  background: rgba(20, 25, 39, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
}

.app-title {
  margin: 0 0 16px;
  font-size: 1.35rem;
  text-align: center;
}

.app-subtitle {
  margin: 0 0 24px;
  font-size: 0.95rem;
  text-align: center;
  opacity: 0.7;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
}

.form-group label {
  font-size: 0.9rem;
  opacity: 0.85;
}

.form-control {
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 12px 14px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
}

.form-control:focus {
  outline: 2px solid rgba(64, 146, 255, 0.4);
}

.form-control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.form-group.invalid .form-control {
  border-color: rgba(255, 107, 107, 0.65);
  box-shadow: 0 0 0 2px rgba(255, 107, 107, 0.18);
}

.form-group textarea.form-control {
  resize: vertical;
  min-height: 100px;
}

.field-error {
  min-height: 18px;
  font-size: 0.8rem;
  color: #ffb0b0;
}

.grid-two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.inline-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 10px 14px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  user-select: none;
}

.option input {
  display: none;
}

.option span {
  font-size: 0.95rem;
}

.option.selected {
  border-color: rgba(100, 168, 255, 0.9);
  background: rgba(100, 168, 255, 0.15);
  box-shadow: 0 0 0 2px rgba(100, 168, 255, 0.2);
}

.form-group.invalid .inline-options .option {
  border-color: rgba(255, 107, 107, 0.7);
  box-shadow: 0 0 0 1px rgba(255, 107, 107, 0.45);
}

.summary-card {
  margin-top: 24px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.summary-title {
  margin: 0 0 14px;
  font-size: 1.05rem;
}

.preview-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 0.92rem;
}

.preview-list li span:first-child {
  opacity: 0.7;
}

.status {
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 0.9rem;
}

.status-info {
  background: rgba(64, 146, 255, 0.12);
  color: #9bc4ff;
}

.status-success {
  background: rgba(46, 204, 113, 0.15);
  color: #aef5c9;
}

.status-error {
  background: rgba(255, 99, 132, 0.15);
  color: #ffb4c2;
}

.hidden {
  display: none !important;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 420px) {
  #app {
    padding: 20px 18px;
  }

  .grid-two {
    gap: 12px;
  }
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 10px;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: linear-gradient(135deg, #4f9dff, #647dff);
  color: #0c111f;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
}


```

# tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "rootDir": "src",
    "outDir": "dist",
    "resolveJsonModule": true
  },
  "include": ["src"]
}

```

