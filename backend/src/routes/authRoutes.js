import express from 'express';
import { logout, logoutAll, refresh } from '../controllers/authController.js';
import { verifyToken } from '../middlewares/auth.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = express.Router();
const refreshLimiter = rateLimit({ windowMs: 60_000, max: 10 });

router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', logout);
router.post('/logout-all', verifyToken, logoutAll);

export default router;
