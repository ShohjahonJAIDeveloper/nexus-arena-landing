/** Приём заявок с сайта: POST /api/lead */
import express from 'express';
import { createLead } from '../leadService.js';
import { looksLikeBot } from '../validate.js';
import { rateLimit } from '../rateLimit.js';
import { club } from '../club.js';

export const leadsRouter = express.Router();

const leadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5 });

leadsRouter.post('/lead', leadLimiter, async (req, res) => {
  const botReason = looksLikeBot(req.body);
  if (botReason) {
    // Боту отвечаем «успехом», чтобы он не подбирал обход, но заявку не пишем.
    console.warn('[lead] отклонено как бот: %s', botReason);
    return res.json({ ok: true, id: null });
  }

  const result = await createLead({ ...req.body, req });
  if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });

  return res.json({
    ok: true,
    id: result.lead.id,
    message: `Спасибо! Администратор перезвонит в течение 15 минут. Если срочно — ${club.phone}`,
  });
});
