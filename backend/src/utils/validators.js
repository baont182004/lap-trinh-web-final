import mongoose from 'mongoose';

export function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

export function requireObjectId(value, { res, payload, status = 400 } = {}) {
    if (isValidObjectId(value)) return true;
    if (res) {
        res.status(status).json(payload || { error: 'Invalid id' });
    }
    return false;
}

export function parsePagination(
    query,
    { defaultLimit = 20, maxLimit = 100, defaultSkip = 0 } = {}
) {
    const limit = Math.min(
        maxLimit,
        Math.max(1, Number.parseInt(query?.limit, 10) || defaultLimit)
    );
    const skip = Math.max(0, Number.parseInt(query?.skip, 10) || defaultSkip);
    return { limit, skip };
}

export function safeTrim(value) {
    return typeof value === 'string' ? value.trim() : '';
}
