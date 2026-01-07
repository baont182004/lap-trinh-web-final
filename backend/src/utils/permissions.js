import { HttpError } from './http.js';

export function isOwnerOrAdmin(resourceUserId, user) {
    return !!user && (user.role === 'admin' || resourceUserId?.toString() === user._id);
}

export function canEditPhoto(user, photo) {
    return isOwnerOrAdmin(photo?.user_id, user);
}

export function canDeletePhoto(user, photo) {
    return isOwnerOrAdmin(photo?.user_id, user);
}

export function assertAuth(user, { status = 401, payload } = {}) {
    if (user?._id) return user;
    throw new HttpError({
        status,
        payload: payload || { error: 'Unauthorized' },
    });
}
