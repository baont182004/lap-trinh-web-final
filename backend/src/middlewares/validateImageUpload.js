import { validateImageBuffer } from '../services/uploadService.js';

export async function validateImageUpload(req, res, next) {
    try {
        const validation = await validateImageBuffer(req.file);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }
        return next();
    } catch (err) {
        return next(err);
    }
}
