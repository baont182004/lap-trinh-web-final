import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { ALLOWED_MIME_TYPES, MAX_IMAGE_SIZE_BYTES } from '../config/uploads.js';
import { uploadPhotoBuffer } from '../config/cloudinary.js';

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    },
});

export async function validateImageBuffer(file) {
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

export async function uploadImageBuffer(fileBuffer) {
    return uploadPhotoBuffer(fileBuffer);
}
