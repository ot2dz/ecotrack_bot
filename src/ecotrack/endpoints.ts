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

export async function getLatestMaj(tracking: string) {
  try {
    const res = await ecoClient.get(`/api/v1/get/maj`, { params: { tracking } });
    logger.debug({ tracking }, 'Fetched latest MAJ');
    return res.data;
  } catch (err: any) {
    logger.error({ err: err?.response?.data || err?.message }, '❌ Failed to fetch latest MAJ');
    throw err;
  }
}

export async function addMajNote(tracking: string, content: string) {
  try {
    const res = await ecoClient.post(`/api/v1/add/maj`, null, { params: { tracking, content } });
    logger.debug({ tracking }, 'Added MAJ note');
    return res.data;
  } catch (err: any) {
    logger.error({ err: err?.response?.data || err?.message }, '❌ Failed to add MAJ note');
    throw err;
  }
}

export async function getTrackingInfo(tracking: string) {
  try {
    const res = await ecoClient.get(`/api/v1/get/tracking/info`, { params: { tracking } });
    logger.debug({ tracking }, 'Fetched tracking info');
    return res.data;
  } catch (err: any) {
    logger.error({ err: err?.response?.data || err?.message }, '❌ Failed to fetch tracking info');
    throw err;
  }
}

export async function getOrdersByStatus(options: { statuses: string[]; trackings?: string[]; apiToken?: string }) {
  try {
    const params: Record<string, string> = {};
    if (options.statuses?.length) params.status = options.statuses.join(',');
    if (options.trackings?.length) params.trackings = options.trackings.join(',');
    if (options.apiToken) params.api_token = options.apiToken;

    const res = await ecoClient.get(`/api/v1/get/orders/status`, { params });
    logger.debug({ statuses: params.status, trackings: params.trackings }, 'Fetched orders by status');
    return res.data;
  } catch (err: any) {
    logger.error({ err: err?.response?.data || err?.message }, '❌ Failed to fetch orders by status');
    throw err;
  }
}
