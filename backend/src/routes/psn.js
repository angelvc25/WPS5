import { Router } from 'express';
import {
  clearPsnCaches,
  getMetadataForName,
  getProductDetails,
  searchGames,
} from '../services/psnMetadataService.js';

const router = Router();

function sendError(res, error) {
  const status = Number(error?.status) || 500;
  console.error('[PsnRoute]', error?.message || error);
  res.status(status).json({ error: error?.message || 'Error en la API de metadatos PSN' });
}

// GET /api/psn/search?q=god of war&locale=es-CO&limit=10
router.get('/search', async (req, res) => {
  try {
    const { q, locale, limit } = req.query;
    const result = await searchGames(q, { locale, limit });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// GET /api/psn/product/:id?locale=es-CO&route=product
// :id es el concept/product ID del Store (p.ej. el que devuelve /search).
router.get('/product/:id', async (req, res) => {
  try {
    const { locale, route } = req.query;
    const details = await getProductDetails(req.params.id, { locale, route });
    res.json(details);
  } catch (error) {
    sendError(res, error);
  }
});

// GET /api/psn/metadata?name=god of war&locale=es-CO
// Atajo: busca y devuelve la mejor coincidencia + su ficha.
router.get('/metadata', async (req, res) => {
  try {
    const { name, locale } = req.query;
    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'Parámetro "name" requerido' });
    }
    const result = await getMetadataForName(name, { locale });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/cache', (_req, res) => {
  clearPsnCaches();
  res.json({ status: 'ok', cleared: true });
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'wps5-psn-metadata-api' });
});

export default router;
