import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import { upload } from '../services/uploadService.js';
import {
    uploadNewPhoto,
    getPhotosOfUser,
    getRecentPhotos,
    addComment,
    deletePhoto,
    updatePhotoDescription,
    replacePhotoImage,
    updateComment,
    deleteComment,
} from '../controllers/photoController.js';


const router = express.Router();

router.use(verifyToken);
router.post('/photos/new', upload.single('uploadedphoto'), uploadNewPhoto);
router.get('/photosOfUser/:id', getPhotosOfUser);
router.get('/photos/recent', getRecentPhotos);
router.post('/commentsOfPhoto/:photo_id', addComment);
router.put('/commentsOfPhoto/:photo_id/:comment_id', updateComment);
router.delete('/commentsOfPhoto/:photo_id/:comment_id', deleteComment);
router.put('/photos/:id', updatePhotoDescription);
router.put('/photos/:id/image', upload.single('uploadedphoto'), replacePhotoImage);
router.delete('/photos/:id', deletePhoto);

export default router;
