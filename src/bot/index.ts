import { Telegraf, Scenes, Markup } from 'telegraf';
import { z } from 'zod';
import { MyContext, OrderData } from './types/context.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { setupSession } from './middlewares/session.js';
import { authMiddleware } from './middlewares/auth.js';
import { createOrderScene } from './scenes/createOrder.js';
import { fetchLatestMaj, addMajNote, fetchTrackingInfo, filterOrdersByStatus } from '../services/track.service.js';
import { formatLatestMaj, formatTrackingInfo, formatOrderList } from './ui/formatters.js';

export const bot = new Telegraf<MyContext>(env.TELEGRAM_BOT_TOKEN);

// إعداد المشاهد (Scenes)
const stage = new Scenes.Stage<MyContext>([createOrderScene]);
bot.use(setupSession());
bot.use(authMiddleware);
bot.use(stage.middleware());

// لوحة البداية
const keyboardRows: any[] = [];

if (env.WEB_APP_URL) {
  keyboardRows.push([Markup.button.webApp('🖥️ واجهة الطلبات', env.WEB_APP_URL)]);
}

const mainKeyboard = keyboardRows.length > 0 
  ? Markup.keyboard(keyboardRows).resize()
  : Markup.removeKeyboard();

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

// أمر تتبع أحدث MAJ: /track <tracking>
bot.command('track', async (ctx) => {
  try {
    const input = ctx.message.text.trim();
    const parts = input.split(/\s+/);
    const tracking = parts[1];

    if (!tracking) {
      await ctx.reply('⚠️ استخدم الأمر هكذا: /track <tracking>');
      return;
    }

    await ctx.reply('🔎 جاري جلب آخر تحديثات الطلب...');

    const maj = await fetchLatestMaj(tracking);

    if (!maj) {
      await ctx.reply('ℹ️ لم يتم تسجيل تحديثات بعد لهذه الطلبية.');
      return;
    }

    await ctx.reply(formatLatestMaj(tracking, maj));
  } catch (error: any) {
    const apiMsg = error?.response?.data?.message || error?.message || 'خطأ غير متوقع';
    logger.error({ err: error }, 'track command failed');
    await ctx.reply(`❌ تعذر جلب التحديثات: ${apiMsg}`);
  }
});

// أمر إضافة ملاحظة: /update <tracking> <text>
bot.command('update', async (ctx) => {
  try {
    const input = ctx.message.text;
    const match = input.match(/^\/update\s+(\S+)\s+([\s\S]+)$/);
    if (!match) {
      await ctx.reply('⚠️ استخدم الأمر هكذا: /update <tracking> <text>');
      return;
    }
    const tracking = match[1].trim();
    const text = match[2].trim();

    if (text.length > 255) {
      await ctx.reply('⚠️ النص طويل جدًا. الرجاء ألا يتجاوز 255 حرفًا.');
      return;
    }

    await ctx.reply('✍️ جاري إضافة الملاحظة...');
    await addMajNote(tracking, text);

    await ctx.reply(`📝 تم إضافة ملاحظة جديدة:\n"${text}"`);
  } catch (error: any) {
    const apiMsg = error?.response?.data?.message || error?.message || 'خطأ غير متوقع';
    logger.error({ err: error }, 'update command failed');
    await ctx.reply(`❌ تعذر إضافة الملاحظة: ${apiMsg}`);
  }
});

// أمر الحالة التفصيلية: /status <tracking>
bot.command('status', async (ctx) => {
  try {
    const input = ctx.message.text.trim();
    const parts = input.split(/\s+/);
    const tracking = parts[1];

    if (!tracking) {
      await ctx.reply('⚠️ استخدم الأمر هكذا: /status <tracking>');
      return;
    }

    await ctx.reply('📊 جاري جلب الحالة التفصيلية...');

    const info = await fetchTrackingInfo(tracking);

    await ctx.reply(formatTrackingInfo(info));
  } catch (error: any) {
    const apiMsg = error?.response?.data?.message || error?.message || 'خطأ غير متوقع';
    logger.error({ err: error }, 'status command failed');
    await ctx.reply(`❌ تعذر جلب الحالة: ${apiMsg}`);
  }
});

// أمر فلترة الطلبات: /filter <status1,status2,...> [trackings optional]
bot.command('filter', async (ctx) => {
  try {
    const input = ctx.message.text;
    const m = input.match(/^\/filter\s+([^\s]+)(?:\s+([^\s]+))?$/);
    if (!m) {
      await ctx.reply('⚠️ استخدم: /filter <status1,status2,...> [trackings اختياري مفصول بفواصل]');
      return;
    }

    const statuses = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const trackings = m[2]?.split(',').map((t) => t.trim()).filter(Boolean);

    await ctx.reply('🗂️ جاري جلب القائمة المطابقة...');

    const items = await filterOrdersByStatus(statuses, trackings);

    if (!items.length) {
      await ctx.reply('ℹ️ لا توجد طلبيات مطابقة.');
      return;
    }

    const groups = formatOrderList(items);
    for (const msg of groups) {
      await ctx.reply(msg);
    }
  } catch (error: any) {
    const apiMsg = error?.response?.data?.message || error?.message || 'خطأ غير متوقع';
    logger.error({ err: error }, 'filter command failed');
    await ctx.reply(`❌ تعذر جلب القائمة: ${apiMsg}`);
  }
});
