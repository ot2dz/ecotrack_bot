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
