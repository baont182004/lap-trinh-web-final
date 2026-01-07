import mongoose from 'mongoose';
import User from '../models/User.js';
import Photo from '../models/Photo.js';
import Friendship from '../models/Friendship.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { ok, badRequest, notFound } from '../utils/http.js';
import { isValidObjectId, safeTrim } from '../utils/validators.js';

const USER_PUBLIC_FIELDS = '_id first_name last_name';
const USER_DETAIL_FIELDS =
    '_id first_name last_name location description occupation login_name';

// Get /user/list
export const getUserList = asyncHandler(async (req, res) => {
    const users = await User.find({}, USER_PUBLIC_FIELDS).lean();
    return ok(res, users);
});

//Get /user/:id
export const getUserById = asyncHandler(async (req, res) => {
    const userId = req.params.id;
    if (!isValidObjectId(userId)) {
        return badRequest(res, { error: 'Invalid user id' });
    }
    const user = await User.findById(userId, USER_DETAIL_FIELDS).lean();
    if (!user) {
        return notFound(res, { error: 'User not found' });
    }
    return ok(res, user);
});

// GET /user/me/stats
export const getMyStats = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!isValidObjectId(userId)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const [photoAgg, friendCount] = await Promise.all([
        Photo.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: '$user_id',
                    photoCount: { $sum: 1 },
                    totalLikes: { $sum: '$likeCount' },
                    totalDislikes: { $sum: '$dislikeCount' },
                },
            },
        ]),
        Friendship.countDocuments({ users: userId }),
    ]);

    const stats = photoAgg[0] || {};
    const totalLikes = stats.totalLikes || 0;
    const totalDislikes = stats.totalDislikes || 0;

    return ok(res, {
        photoCount: stats.photoCount || 0,
        friendCount: friendCount || 0,
        totalLikes,
        totalDislikes,
        totalReactions: totalLikes + totalDislikes,
    });
});

// GET /user/search?name=...
export const searchUsersByName = asyncHandler(async (req, res) => {
    const nameQuery = req.query.name;
    if (!nameQuery || typeof nameQuery !== 'string' || nameQuery.trim() === '') {
        return badRequest(res, { error: 'name query parameter is required' });
    }

    const regex = new RegExp(nameQuery.trim(), 'i');
    const users = await User.find(
        {
            $or: [
                { first_name: { $regex: regex } },
                { last_name: { $regex: regex } },
            ],
        },
        USER_PUBLIC_FIELDS
    ).lean();

    return ok(res, users);
});

// POST /user
export const register = asyncHandler(async (req, res) => {
    const {
        login_name,
        password,
        first_name,
        last_name,
        location = "",
        description = "",
        occupation = "",
    } = req.body || {};

    const loginName = safeTrim(login_name);
    const pass = safeTrim(password);
    const firstName = safeTrim(first_name);
    const lastName = safeTrim(last_name);

    // Validate theo spec: login_name unique, password/first/last non-empty
    if (!loginName) {
        return badRequest(res, { error: 'login_name is required' });
    }
    if (!pass) {
        return badRequest(res, { error: 'password is required' });
    }
    if (!firstName) {
        return badRequest(res, { error: 'first_name is required' });
    }
    if (!lastName) {
        return badRequest(res, { error: 'last_name is required' });
    }

    const existed = await User.findOne({ login_name: loginName }).lean();
    if (existed) {
        return badRequest(res, { error: 'login_name already exists' });
    }

    let user;
    try {
        user = await User.create({
            login_name: loginName,
            password: pass,
            first_name: firstName,
            last_name: lastName,
            location,
            description,
            occupation,
        });
    } catch (error) {
        if (error?.code === 11000) {
            return badRequest(res, { error: 'login_name already exists' });
        }
        throw error;
    }

    return ok(res, {
        _id: user._id,
        login_name: user.login_name,
        first_name: user.first_name,
        last_name: user.last_name,
        location: user.location,
        description: user.description,
        occupation: user.occupation,
        role: user.role,
    });
});
