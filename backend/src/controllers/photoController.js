import mongoose from 'mongoose';
import { fileTypeFromBuffer } from 'file-type';
import Photo from '../models/Photo.js';
import Reaction from '../models/Reaction.js';
import { deleteImageByPublicId, uploadImageBuffer } from '../config/cloudinary.js';
import { ALLOWED_MIME_TYPES } from '../config/uploads.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { created, ok, badRequest, forbidden, notFound } from '../utils/http.js';
import { isOwnerOrAdmin } from '../utils/permissions.js';
import { isValidObjectId } from '../utils/validators.js';

const COMMENT_FIELDS = '_id first_name last_name login_name';
const FEED_DEFAULT_LIMIT = 12;
const FEED_MAX_LIMIT = 30;
const OPTIMIZED_TRANSFORM = 'f_auto,q_auto,w_1080';

function parseFeedLimit(rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isNaN(parsed)) return FEED_DEFAULT_LIMIT;
    return Math.min(FEED_MAX_LIMIT, Math.max(1, parsed));
}

function parseCursor(rawCursor) {
    if (!rawCursor || typeof rawCursor !== 'string') return null;
    const [rawDate, rawId] = rawCursor.split('|');
    if (!rawDate || !rawId) return null;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return null;
    if (!isValidObjectId(rawId)) return null;
    return { date, id: new mongoose.Types.ObjectId(rawId) };
}

function buildOptimizedUrl(url) {
    if (!url) return '';
    const marker = '/upload/';
    const idx = url.indexOf(marker);
    if (idx === -1) return url;
    const prefix = url.slice(0, idx + marker.length);
    const suffix = url.slice(idx + marker.length);
    return `${prefix}${OPTIMIZED_TRANSFORM}/${suffix}`;
}

function shapePhoto(doc, photoReactions = new Map(), commentReactions = new Map()) {
    if (!doc) return null;
    const p = doc.toObject ? doc.toObject() : doc;
    return {
        ...p,
        imageUrlOptimized: p.imageUrl ? buildOptimizedUrl(p.imageUrl) : undefined,
        likeCount: p.likeCount || 0,
        dislikeCount: p.dislikeCount || 0,
        myReaction: photoReactions.get(String(p._id)) || 0,
        comments: (p.comments || []).map((c) => ({
            _id: c._id,
            comment: c.comment,
            date_time: c.date_time,
            user: c.user || c.user_id,
            likeCount: c.likeCount || 0,
            dislikeCount: c.dislikeCount || 0,
            myReaction: commentReactions.get(String(c._id)) || 0,
        })),
    };
}

async function attachReactions(photos, userId) {
    if (!photos || photos.length === 0) return [];
    if (!userId) return photos.map((p) => shapePhoto(p));

    const photoIds = photos.map((p) => p._id);
    const commentIds = photos.flatMap((p) =>
        (p.comments || []).map((c) => c._id)
    );

    const reactions = await Reaction.find({
        user: userId,
        $or: [
            { targetType: 'Photo', targetId: { $in: photoIds } },
            { targetType: 'Comment', targetId: { $in: commentIds } },
        ],
    }).lean();

    const photoReactions = new Map();
    const commentReactions = new Map();
    reactions.forEach((r) => {
        const key = String(r.targetId);
        if (r.targetType === 'Photo') photoReactions.set(key, r.value);
        if (r.targetType === 'Comment') commentReactions.set(key, r.value);
    });

    return photos.map((p) => shapePhoto(p, photoReactions, commentReactions));
}

async function fetchPhotoWithComments(photoId) {
    return Photo.findById(photoId)
        .populate('comments.user_id', COMMENT_FIELDS)
        .lean();
}

async function validateImageBuffer(file) {
    if (!file?.buffer) {
        return { ok: false, error: 'No file uploaded' };
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return { ok: false, error: 'Only image files are allowed' };
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        return { ok: false, error: 'Unsupported image type' };
    }
    return { ok: true };
}

// GET /photosOfUser/:id
export const getPhotosOfUser = asyncHandler(
    async (req, res) => {
        const photos = await Photo.find({ user_id: req.params.id })
            .sort({ date_time: -1 })
            .populate('comments.user_id', COMMENT_FIELDS)
            .lean();

        const shaped = await attachReactions(photos, req.user?._id);

        return ok(res, shaped);
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);

// GET /photos/recent
export const getRecentPhotos = asyncHandler(
    async (req, res) => {
        const limit = parseFeedLimit(req.query.limit);
        const rawCursor = req.query.cursor;
        const cursor = parseCursor(rawCursor);
        if (rawCursor && !cursor) {
            return badRequest(res, { error: 'Invalid cursor' });
        }

        const query = {};
        if (cursor) {
            query.$or = [
                { date_time: { $lt: cursor.date } },
                { date_time: cursor.date, _id: { $lt: cursor.id } },
            ];
        }

        const photos = await Photo.find(query)
            .sort({ date_time: -1, _id: -1 })
            .limit(limit + 1)
            .select(
                'imageUrl publicId width height format bytes description date_time user_id likeCount dislikeCount'
            )
            .populate('user_id', '_id first_name last_name')
            .lean();

        const hasMore = photos.length > limit;
        const items = hasMore ? photos.slice(0, limit) : photos;
        const shaped = await attachReactions(items, req.user?._id);

        const last = items[items.length - 1];
        const nextCursor =
            hasMore && last
                ? `${new Date(last.date_time).toISOString()}|${last._id}`
                : null;

        return ok(res, {
            items: shaped,
            nextCursor,
            hasMore,
        });
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);



// POST /commentsOfPhoto/:photo_id
export const addComment = asyncHandler(
    async (req, res) => {
        const { comment } = req.body || {};
        if (!comment || typeof comment !== 'string' || comment.trim() === '') {
            return res.status(400).send('Empty comment');
        }

        const photo = await Photo.findById(req.params.photo_id);
        if (!photo) return res.status(400).send('Photo not found');

        const userId = req.user?._id;
        if (!userId) return res.sendStatus(401);

        photo.comments.push({
            comment: comment.trim(),
            date_time: new Date(),
            user_id: userId,
        });

        await photo.save();

        const updated = await fetchPhotoWithComments(req.params.photo_id);
        const shaped = await attachReactions(updated ? [updated] : [], req.user?._id);
        return ok(res, shaped[0] || null);
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);

// Post /photos/new
export const uploadNewPhoto = asyncHandler(
    async (req, res) => {
        const validation = await validateImageBuffer(req.file);
        if (!validation.ok) {
            return badRequest(res, { error: validation.error });
        }
        const userId = req.user?._id;
        if (!userId) return res.sendStatus(401);

        const rawDescription = req.body?.description;
        const description =
            typeof rawDescription === 'string' ? rawDescription.trim() : '';
        if (description.length > 200) {
            return badRequest(res, { error: 'Description too long' });
        }

        const uploaded = await uploadImageBuffer(req.file.buffer, {
            public_id: undefined,
        });

        const photo = await Photo.create({
            imageUrl: uploaded.secure_url,
            publicId: uploaded.public_id,
            width: uploaded.width,
            height: uploaded.height,
            format: uploaded.format,
            bytes: uploaded.bytes,
            date_time: new Date(),
            user_id: userId,
            description,
            comments: [],
        });

        return created(res, shapePhoto(photo));
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);

// DELETE /photos/:id
export const deletePhoto = asyncHandler(
    async (req, res) => {
        const photoId = req.params.id;
        if (!isValidObjectId(photoId)) {
            return badRequest(res, { error: 'Invalid photo id' });
        }

        const photo = await Photo.findById(photoId);
        if (!photo) return notFound(res, { error: 'Photo not found' });

        if (!isOwnerOrAdmin(photo.user_id, req.user)) {
            return forbidden(res, { error: 'Not allowed to delete this photo' });
        }

        const oldPublicId = photo.publicId;
        await Photo.deleteOne({ _id: photoId });

        if (oldPublicId) {
            await deleteImageByPublicId(oldPublicId);
        }

        return ok(res, { success: true });
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);

// PUT /photos/:id
export const updatePhotoDescription = asyncHandler(
    async (req, res) => {
        const photoId = req.params.id;
        if (!isValidObjectId(photoId)) {
            return badRequest(res, { error: 'Invalid photo id' });
        }

        const rawDescription = req.body?.description;
        if (rawDescription !== undefined && typeof rawDescription !== 'string') {
            return badRequest(res, { error: 'Invalid description' });
        }
        const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
        if (description.length > 200) {
            return badRequest(res, { error: 'Description too long' });
        }

        const photo = await Photo.findById(photoId);
        if (!photo) return notFound(res, { error: 'Photo not found' });

        if (!req.user?._id || photo.user_id?.toString() !== req.user._id) {
            return forbidden(res, { error: 'Not allowed to edit this photo' });
        }

        photo.description = description;
        await photo.save();

        const updated = await fetchPhotoWithComments(photoId);
        const shaped = await attachReactions(updated ? [updated] : [], req.user?._id);
        return ok(res, shaped[0] || null);
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);

// PUT /photos/:id/image
export const replacePhotoImage = asyncHandler(
    async (req, res) => {
        const photoId = req.params.id;
        if (!isValidObjectId(photoId)) {
            return badRequest(res, { error: 'Invalid photo id' });
        }
        const validation = await validateImageBuffer(req.file);
        if (!validation.ok) {
            return badRequest(res, { error: validation.error });
        }

        const photo = await Photo.findById(photoId);
        if (!photo) return notFound(res, { error: 'Photo not found' });

        if (!isOwnerOrAdmin(photo.user_id, req.user)) {
            return forbidden(res, { error: 'Not allowed to edit this photo' });
        }

        const oldPublicId = photo.publicId;
        const uploaded = await uploadImageBuffer(req.file.buffer, {
            public_id: undefined,
        });

        photo.imageUrl = uploaded.secure_url;
        photo.publicId = uploaded.public_id;
        photo.width = uploaded.width;
        photo.height = uploaded.height;
        photo.format = uploaded.format;
        photo.bytes = uploaded.bytes;
        await photo.save();

        if (oldPublicId) {
            await deleteImageByPublicId(oldPublicId);
        }

        const updated = await fetchPhotoWithComments(photoId);
        const shaped = await attachReactions(updated ? [updated] : [], req.user?._id);
        return ok(res, shaped[0] || null);
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);

// PUT /commentsOfPhoto/:photo_id/:comment_id
export const updateComment = asyncHandler(
    async (req, res) => {
        const { photo_id: photoId, comment_id: commentId } = req.params;
        if (!isValidObjectId(photoId) || !isValidObjectId(commentId)) {
            return badRequest(res, { error: 'Invalid id' });
        }

        const { comment } = req.body || {};
        if (!comment || typeof comment !== 'string' || comment.trim() === '') {
            return badRequest(res, { error: 'Empty comment' });
        }

        const photo = await Photo.findById(photoId);
        if (!photo) return notFound(res, { error: 'Photo not found' });

        const cmt = photo.comments.id(commentId);
        if (!cmt) return notFound(res, { error: 'Comment not found' });

        if (!isOwnerOrAdmin(cmt.user_id, req.user)) {
            return forbidden(res, { error: 'Not allowed to edit this comment' });
        }

        cmt.comment = comment.trim();
        await photo.save();

        const updated = await fetchPhotoWithComments(photoId);
        const shaped = await attachReactions(updated ? [updated] : [], req.user?._id);
        return ok(res, shaped[0] || null);
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);

// DELETE /commentsOfPhoto/:photo_id/:comment_id
export const deleteComment = asyncHandler(
    async (req, res) => {
        const { photo_id: photoId, comment_id: commentId } = req.params;
        if (!isValidObjectId(photoId) || !isValidObjectId(commentId)) {
            return badRequest(res, { error: 'Invalid id' });
        }

        const photo = await Photo.findById(photoId);
        if (!photo) return notFound(res, { error: 'Photo not found' });

        const cmt = photo.comments.id(commentId);
        if (!cmt) return notFound(res, { error: 'Comment not found' });

        if (!isOwnerOrAdmin(cmt.user_id, req.user)) {
            return forbidden(res, { error: 'Not allowed to delete this comment' });
        }

        cmt.remove();
        await photo.save();

        const updated = await fetchPhotoWithComments(photoId);
        const shaped = await attachReactions(updated ? [updated] : [], req.user?._id);
        return ok(res, shaped[0] || null);
    },
    { defaultMessage: 'Server error', responseType: 'text' }
);
