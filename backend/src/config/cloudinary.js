import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;

export const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || undefined;

cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
});

export function ensureCloudinaryConfigured() {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary config missing');
    }
}

export function uploadImageBuffer(buffer, options = {}) {
    ensureCloudinaryConfigured();
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'image', folder: CLOUDINARY_FOLDER, ...options },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
}

export async function deleteImageByPublicId(publicId) {
    if (!publicId) return null;
    try {
        return await cloudinary.uploader.destroy(publicId, {
            invalidate: true,
            resource_type: 'image',
        });
    } catch (err) {
        console.warn('Cloudinary delete failed:', err.message || err);
        return null;
    }
}

export async function uploadPhotoBuffer(buffer, options = {}) {
    return uploadImageBuffer(buffer, { public_id: undefined, ...options });
}
