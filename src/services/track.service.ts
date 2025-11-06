import { getLatestMaj, addMajNote as addMajNoteEndpoint, getTrackingInfo as getTrackingInfoEndpoint, getOrdersByStatus as getOrdersByStatusEndpoint } from '../ecotrack/endpoints.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// بسيط: كاش بالذاكرة لنتائج /status لمدة قصيرة لتقليل الضغط
const trackingInfoCache = new Map<string, { value: TrackingInfo; expiresAt: number }>();
const TRACKING_INFO_TTL_MS = 30_000; // 30 ثانية

export type LatestMaj = {
  station?: string;
  driver?: string;
  note?: string;
  date?: string;
};

export type TrackingHistoryItem = {
  status: string;
  at: string;
};

export type TrackingInfo = {
  tracking: string;
  currentStatus?: string;
  lastUpdate?: string;
  history: TrackingHistoryItem[];
};

export type OrderListItem = {
  tracking: string;
  status?: string;
  commune?: string;
  lastActivity?: string;
};

export async function fetchLatestMaj(tracking: string): Promise<LatestMaj | null> {
  const trimmed = tracking?.trim();
  if (!trimmed) throw new Error('Tracking is required');

  try {
    const data = await getLatestMaj(trimmed);
    if (!data) return null;

    const result: LatestMaj = {
      station: data.station || data.hub || data.office || data.site || undefined,
      driver: data.driver || data.livreur || data.agent || undefined,
      note: data.note || data.remark || data.comment || undefined,
      date: data.date || data.updated_at || data.timestamp || undefined,
    };

    const allEmpty = Object.values(result).every((v) => !v);
    if (allEmpty) return null;

    return result;
  } catch (err: any) {
    logger.error({ err }, 'fetchLatestMaj failed');
    throw err;
  }
}

export async function addMajNote(tracking: string, content: string): Promise<void> {
  const t = tracking?.trim();
  const c = content?.trim();
  if (!t) throw new Error('Tracking is required');
  if (!c) throw new Error('Note content is required');
  if (c.length > 255) throw new Error('Note must be 255 characters or fewer');

  try {
    await addMajNoteEndpoint(t, c);
  } catch (err: any) {
    logger.error({ err }, 'addMajNote failed');
    throw err;
  }
}

export async function fetchTrackingInfo(tracking: string): Promise<TrackingInfo> {
  const t = tracking?.trim();
  if (!t) throw new Error('Tracking is required');

  const cached = trackingInfoCache.get(t);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const data = await getTrackingInfoEndpoint(t);
    const info: TrackingInfo = {
      tracking: t,
      currentStatus: data?.current_status || data?.status || data?.etat || undefined,
      lastUpdate: data?.last_update || data?.updated_at || data?.timestamp || undefined,
      history: [],
    };

    const rawHistory = data?.history || data?.timeline || data?.events || [];
    if (Array.isArray(rawHistory)) {
      info.history = rawHistory.map((it: any) => ({
        status: it.status || it.state || it.etat || 'unknown',
        at: it.at || it.date || it.timestamp || '',
      }));
    }

    trackingInfoCache.set(t, { value: info, expiresAt: now + TRACKING_INFO_TTL_MS });
    return info;
  } catch (err: any) {
    logger.error({ err }, 'fetchTrackingInfo failed');
    throw err;
  }
}

export async function filterOrdersByStatus(statuses: string[], trackings?: string[], apiToken?: string): Promise<OrderListItem[]> {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error('至少 حالة واحدة مطلوبة');
  }
  try {
    const token = apiToken || env.ECOTRACK_API_KEY; // تمرير api_token إذا تطلبه الEndpoint
    const data = await getOrdersByStatusEndpoint({ statuses, trackings, apiToken: token });

    const payload = data?.data ?? data;

    // الحالة 1: مصفوفة عناصر
    if (Array.isArray(payload)) {
      return payload.map((it: any) => ({
        tracking: it.tracking || it.code || it.ref || '',
        status: it.status || it.etat || it.state || undefined,
        commune: it.commune || it.city || undefined,
        lastActivity: it.last_activity || it.updated_at || it.date || undefined,
      }));
    }

    // الحالة 2: كائن مَعنون بالمفاتيح = tracking
    if (payload && typeof payload === 'object') {
      const result: OrderListItem[] = [];
      for (const [key, val] of Object.entries(payload as Record<string, any>)) {
        const obj = val as any;
        const lastActivity = Array.isArray(obj.activity) && obj.activity.length
          ? `${obj.activity[0]?.date ?? ''} ${obj.activity[0]?.time ?? ''}`.trim()
          : undefined;
        result.push({
          tracking: key,
          status: obj.status || obj.etat || obj.state || undefined,
          commune: obj.commune || obj.city || undefined,
          lastActivity,
        });
      }
      return result;
    }

    return [];
  } catch (err: any) {
    logger.error({ err }, 'filterOrdersByStatus failed');
    throw err;
  }
}
