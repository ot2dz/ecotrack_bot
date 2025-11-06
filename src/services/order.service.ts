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

