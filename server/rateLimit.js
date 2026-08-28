/** Лимитер запросов в памяти процесса: без Redis и лишних зависимостей. */
const buckets = new Map();

/**
 * @param {{windowMs:number, max:number, key?:(req)=>string}} options
 */
export function rateLimit({ windowMs, max, key = clientIp }) {
  return (req, res, next) => {
    const id = key(req);
    const now = Date.now();
    const bucket = buckets.get(id);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        error: 'Слишком много запросов. Попробуйте позже или позвоните нам.',
        retryAfter,
      });
    }
    return next();
  };
}

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Сброс счётчика после успешного действия (например, верного пароля). */
export function resetLimit(id) {
  buckets.delete(id);
}

// Раз в 10 минут выкидываем протухшие записи, чтобы Map не рос бесконечно.
setInterval(() => {
  const now = Date.now();
  for (const [id, bucket] of buckets) if (now > bucket.resetAt) buckets.delete(id);
}, 10 * 60 * 1000).unref();
