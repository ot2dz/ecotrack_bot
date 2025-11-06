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

