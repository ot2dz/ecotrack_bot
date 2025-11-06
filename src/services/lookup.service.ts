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
