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
