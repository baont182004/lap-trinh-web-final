const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXCLUDED_PATHS = new Set(['/admin/login', '/api/auth/refresh']);

export function csrfGuard(req, res, next) {
    if (process.env.CROSS_SITE_COOKIES !== 'true') return next();
    if (!STATE_CHANGING_METHODS.has(req.method)) return next();
    if (EXCLUDED_PATHS.has(req.path)) return next();

    const headerToken = req.get('x-csrf-token');
    const cookieToken = req.cookies?.csrf_token;

    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    return next();
}
