import Photo from '../models/Photo.js';
import Reaction from '../models/Reaction.js';
import { uploadImageBuffer } from './uploadService.js';
import fs from 'fs';
import path from 'path';
import { toClient } from '../presenters/photoPresenter.js';

export const COMMENT_FIELDS = '_id first_name last_name login_name';

export async function fetchPhotoWithComments(photoId) {
    return Photo.findById(photoId)
        .populate('comments.user_id', COMMENT_FIELDS)
        .lean();
}

export async function attachReactions(photos, userId) {
    if (!photos || photos.length === 0) return [];
    if (!userId) return photos.map((p) => toClient(p));

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

    return photos.map((p) =>
        toClient(p, { photoReactions, commentReactions })
    );
}

export async function createPhotoFromUpload({ userId, fileBuffer, description }) {
    const uploaded = await uploadImageBuffer(fileBuffer);

    return Photo.create({
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
}

export async function replacePhotoImage({ photo, fileBuffer }) {
    const oldPublicId = photo.publicId;
    const uploaded = await uploadImageBuffer(fileBuffer);

    photo.imageUrl = uploaded.secure_url;
    photo.publicId = uploaded.public_id;
    photo.width = uploaded.width;
    photo.height = uploaded.height;
    photo.format = uploaded.format;
    photo.bytes = uploaded.bytes;
    await photo.save();

    return { photo, oldPublicId };
}

export async function deletePhotoAsset(photo) {
    if (!photo) return { oldPublicId: null };
    const oldPublicId = photo.publicId;
    if (!oldPublicId && photo.file_name && !photo.imageUrl) {
        const imagesDir = path.join(process.cwd(), 'images');
        const filePath = path.join(imagesDir, photo.file_name);
        fs.promises.unlink(filePath).catch(() => { });
    }
    return { oldPublicId };
}
