export class HttpError extends Error {
    constructor({ status = 500, message = 'Server error', payload, responseType } = {}) {
        super(message);
        this.status = status;
        this.payload = payload;
        this.responseType = responseType;
    }
}

function normalizePayload(payload, defaultKey = 'error') {
    if (!payload) return { [defaultKey]: undefined };
    if (typeof payload === 'string') return { [defaultKey]: payload };
    return payload;
}

export function ok(res, data) {
    return res.status(200).json(data);
}

export function created(res, data) {
    return res.status(201).json(data);
}

export function fail(res, { status = 500, payload, defaultKey } = {}) {
    return res.status(status).json(normalizePayload(payload, defaultKey));
}

export function badRequest(res, payload) {
    return fail(res, { status: 400, payload });
}

export function unauthorized(res, payload) {
    return fail(res, { status: 401, payload });
}

export function forbidden(res, payload) {
    return fail(res, { status: 403, payload });
}

export function notFound(res, payload) {
    return fail(res, { status: 404, payload });
}
