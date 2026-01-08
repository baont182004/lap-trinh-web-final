import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'crypto';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import {
    signAccessToken,
    signRefreshToken,
    sha256,
} from '../utils/tokens.js';
import {
    getAccessCookieOptions,
    getCsrfCookieOptions,
    getRefreshCookieOptions,
} from '../config/cookies.js';

async function revokeFamily(userId, family) {
    if (!userId || !family) return;
    await RefreshToken.updateMany(
        { user: userId, family, revokedAt: null },
        { $set: { revokedAt: new Date() } }
    );
}

export async function login(req, res) {
    try {
        const { login_name, password } = req.body || {};
        if (!login_name) return res.status(400).send('login_name is required');

        const user = await User.findOne({ login_name }).select("+password");
        if (!user) return res.status(400).send('Invalid login_name');

        if (!password || password !== user.password) {
            return res.status(400).send('Invalid password');
        }

        const payload = {
            _id: user._id.toString(),
            login_name: user.login_name,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role || "user",
        };

        const family = randomUUID();
        const accessToken = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id, family);
        const decodedRefresh = jwt.decode(refreshToken);

        if (!decodedRefresh?.jti || !decodedRefresh?.exp) {
            throw new Error('Invalid refresh token payload');
        }

        await RefreshToken.create({
            user: user._id,
            tokenHash: sha256(refreshToken),
            jti: decodedRefresh.jti,
            family,
            expiresAt: new Date(decodedRefresh.exp * 1000),
            ip: req.ip,
            userAgent: req.get('user-agent') || '',
        });

        res.cookie('access_token', accessToken, getAccessCookieOptions());
        res.cookie('refresh_token', refreshToken, getRefreshCookieOptions());
        if (process.env.CROSS_SITE_COOKIES === 'true') {
            res.cookie('csrf_token', randomBytes(32).toString('base64'), getCsrfCookieOptions());
        }

        const responseBody = { user: payload };
        if (process.env.RETURN_ACCESS_TOKEN_IN_BODY === 'true') {
            responseBody.token = accessToken;
        }

        return res.status(200).json(responseBody);
    } catch (err) {
        console.error('login error:', err);
        return res.status(500).send('Server error');
    }
}

export async function logout(req, res) {
    const refreshToken = req.cookies?.refresh_token;

    if (refreshToken) {
        const tokenHash = sha256(refreshToken);
        await RefreshToken.updateOne(
            { tokenHash, revokedAt: null },
            { $set: { revokedAt: new Date() } }
        );
    }

    res.clearCookie('access_token', getAccessCookieOptions());
    res.clearCookie('refresh_token', getRefreshCookieOptions());
    res.clearCookie('csrf_token', getCsrfCookieOptions());
    return res.status(200).json({ ok: true });
}

export async function refresh(req, res) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
        res.clearCookie('access_token', getAccessCookieOptions());
        res.clearCookie('refresh_token', getRefreshCookieOptions());
        res.clearCookie('csrf_token', getCsrfCookieOptions());
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let decoded;
    try {
        decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
        console.error('refresh verify error:', err);
        res.clearCookie('access_token', getAccessCookieOptions());
        res.clearCookie('refresh_token', getRefreshCookieOptions());
        res.clearCookie('csrf_token', getCsrfCookieOptions());
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenHash = sha256(refreshToken);
    const stored = await RefreshToken.findOne({ tokenHash });

    if (!stored || stored.revokedAt) {
        await revokeFamily(decoded.sub, decoded.family);
        res.clearCookie('access_token', getAccessCookieOptions());
        res.clearCookie('refresh_token', getRefreshCookieOptions());
        res.clearCookie('csrf_token', getCsrfCookieOptions());
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const family = decoded.family;
    const userId = decoded.sub;

    const newRefreshToken = signRefreshToken(userId, family);
    const newDecoded = jwt.decode(newRefreshToken);

    if (!newDecoded?.jti || !newDecoded?.exp) {
        throw new Error('Invalid refresh token payload');
    }

    stored.revokedAt = now;
    stored.replacedByTokenHash = sha256(newRefreshToken);
    await stored.save();

    await RefreshToken.create({
        user: userId,
        tokenHash: sha256(newRefreshToken),
        jti: newDecoded.jti,
        family,
        expiresAt: new Date(newDecoded.exp * 1000),
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
    });

    const accessToken = signAccessToken(userId);
    res.cookie('access_token', accessToken, getAccessCookieOptions());
    res.cookie('refresh_token', newRefreshToken, getRefreshCookieOptions());
    if (process.env.CROSS_SITE_COOKIES === 'true') {
        res.cookie('csrf_token', randomBytes(32).toString('base64'), getCsrfCookieOptions());
    }

    return res.status(200).json({ ok: true });
}

export async function logoutAll(req, res) {
    const userId = req.user?._id;
    if (userId) {
        await RefreshToken.updateMany(
            { user: userId, revokedAt: null },
            { $set: { revokedAt: new Date() } }
        );
    }

    res.clearCookie('access_token', getAccessCookieOptions());
    res.clearCookie('refresh_token', getRefreshCookieOptions());
    res.clearCookie('csrf_token', getCsrfCookieOptions());
    return res.status(200).json({ ok: true });
}
