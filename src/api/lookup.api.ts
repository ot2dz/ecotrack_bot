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

