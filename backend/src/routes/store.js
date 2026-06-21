import { Router } from 'express';
import { getDeals } from '../services/playstationService.js';

const router = Router();

router.get('/deals', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const deals = await getDeals({ forceRefresh });
    res.json(deals);
  } catch (error) {
    console.error('[StoreRoute] Error obteniendo ofertas:', error);
    res.status(500).json({ error: 'Error obteniendo ofertas de PlayStation Store' });
  }
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wps5-store-api' });
});

export default router;
