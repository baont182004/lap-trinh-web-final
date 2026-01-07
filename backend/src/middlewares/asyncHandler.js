import { HttpError } from '../utils/http.js';

export default function asyncHandler(fn, options = {}) {
    const { defaultMessage, responseType } = options;
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((err) => {
            if (err instanceof HttpError) return next(err);
            const message = defaultMessage || err?.message || 'Server error';
            return next(
                new HttpError({
                    status: err?.status || 500,
                    message,
                    responseType,
                })
            );
        });
    };
}
