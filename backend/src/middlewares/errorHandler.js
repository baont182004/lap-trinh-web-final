import { HttpError } from '../utils/http.js';

export default function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err?.name === 'MulterError') {
        return res.status(400).json({ error: err.message });
    }
    if (err?.message?.includes('image files')) {
        return res.status(400).json({ error: err.message });
    }

    const status = err?.status || 500;
    if (err instanceof HttpError) {
        if (err.responseType === 'text') {
            return res.status(status).send(err.message);
        }
        if (err.payload) {
            return res.status(status).json(err.payload);
        }
        return res.status(status).json({ error: err.message });
    }

    return res.status(status).json({ error: err?.message || 'Server error' });
}
