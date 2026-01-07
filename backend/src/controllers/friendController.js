import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Friendship from "../models/Friendship.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import { badRequest, forbidden, notFound, ok, created } from "../utils/http.js";
import { isValidObjectId, parsePagination } from "../utils/validators.js";

const USER_SUMMARY_FIELDS = "_id first_name last_name login_name";
function isSameId(a, b) {
    return String(a) === String(b);
}

function canonicalPair(a, b) {
    const [first, second] = [String(a), String(b)].sort();
    return [new mongoose.Types.ObjectId(first), new mongoose.Types.ObjectId(second)];
}

function pairKeyForIds(a, b) {
    const [first, second] = [String(a), String(b)].sort();
    return `${first}:${second}`;
}

async function ensureUserExists(userId, res) {
    const exists = await User.exists({ _id: userId });
    if (!exists) {
        notFound(res, { error: "User not found" });
        return false;
    }
    return true;
}

export const sendFriendRequest = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const targetId = req.params.userId;

    if (!isValidObjectId(targetId)) {
        return badRequest(res, { error: "Invalid user id" });
    }
    if (isSameId(meId, targetId)) {
        return badRequest(res, { error: "Cannot send request to yourself" });
    }
    if (!(await ensureUserExists(targetId, res))) return;

    const pair = canonicalPair(meId, targetId);
    const pairKey = pairKeyForIds(meId, targetId);
    const existingFriendship = await Friendship.findOne({
        $or: [{ pairKey }, { users: pair }],
    }).lean();
    if (existingFriendship) {
        return res.status(409).json({ error: "Already friends" });
    }

    const existingRequest = await FriendRequest.findOne({
        status: "PENDING",
        $or: [
            { from: meId, to: targetId },
            { from: targetId, to: meId },
        ],
    }).lean();

    if (existingRequest) {
        if (isSameId(existingRequest.from, meId)) {
            return ok(res, {
                message: "Request already sent",
                requestId: existingRequest._id,
            });
        }
        return res.status(409).json({
            error: "Incoming request already exists",
            requestId: existingRequest._id,
        });
    }

    let createdRequest;
    try {
        createdRequest = await FriendRequest.create({
            from: meId,
            to: targetId,
            status: "PENDING",
        });
    } catch (error) {
        if (error?.code === 11000) {
            return ok(res, { message: "Request already sent" });
        }
        throw error;
    }

    return created(res, {
        message: "Request sent",
        requestId: createdRequest._id,
    });
});

export const getIncomingRequests = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const { limit, skip } = parsePagination(req.query);

    const [items, total] = await Promise.all([
        FriendRequest.find({ to: meId, status: "PENDING" })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("from", USER_SUMMARY_FIELDS)
            .lean(),
        FriendRequest.countDocuments({ to: meId, status: "PENDING" }),
    ]);

    return ok(res, {
        items: items.map((reqItem) => ({
            _id: reqItem._id,
            from: reqItem.from,
            createdAt: reqItem.createdAt,
        })),
        total,
        limit,
        skip,
    });
});

export const getOutgoingRequests = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const { limit, skip } = parsePagination(req.query);

    const [items, total] = await Promise.all([
        FriendRequest.find({ from: meId, status: "PENDING" })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("to", USER_SUMMARY_FIELDS)
            .lean(),
        FriendRequest.countDocuments({ from: meId, status: "PENDING" }),
    ]);

    return ok(res, {
        items: items.map((reqItem) => ({
            _id: reqItem._id,
            to: reqItem.to,
            createdAt: reqItem.createdAt,
        })),
        total,
        limit,
        skip,
    });
});

export const acceptFriendRequest = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const requestId = req.params.requestId;

    if (!isValidObjectId(requestId)) {
        return badRequest(res, { error: "Invalid request id" });
    }

    const request = await FriendRequest.findOne({
        _id: requestId,
        status: "PENDING",
    }).lean();

    if (!request) {
        return notFound(res, { error: "Request not found" });
    }
    if (!isSameId(request.to, meId)) {
        return forbidden(res, { error: "Not allowed" });
    }

    const pair = canonicalPair(request.from, request.to);
    const pairKey = pairKeyForIds(request.from, request.to);
    let friendship;
    try {
        friendship = await Friendship.findOneAndUpdate(
            { pairKey },
            { $setOnInsert: { users: pair, pairKey } },
            { upsert: true, new: true }
        ).lean();
    } catch (error) {
        if (error?.code === 11000) {
            return ok(res, { message: "Already friends" });
        }
        throw error;
    }

    if (!friendship) {
        friendship = await Friendship.findOne({ pairKey }).lean();
    }

    await FriendRequest.deleteMany({
        $or: [
            { from: request.from, to: request.to },
            { from: request.to, to: request.from },
        ],
    });

    console.info("acceptFriendRequest", {
        requestId,
        meId: String(meId),
        from: String(request.from),
        to: String(request.to),
        friendshipId: friendship?._id ? String(friendship._id) : null,
    });

    return ok(res, { message: "Accepted" });
});

export const declineFriendRequest = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const requestId = req.params.requestId;

    if (!isValidObjectId(requestId)) {
        return badRequest(res, { error: "Invalid request id" });
    }

    const request = await FriendRequest.findOne({
        _id: requestId,
        status: "PENDING",
    }).lean();

    if (!request) {
        return notFound(res, { error: "Request not found" });
    }
    if (!isSameId(request.to, meId)) {
        return forbidden(res, { error: "Not allowed" });
    }

    await FriendRequest.deleteOne({ _id: requestId });
    return ok(res, { message: "Declined" });
});

export const cancelFriendRequest = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const requestId = req.params.requestId;

    if (!isValidObjectId(requestId)) {
        return badRequest(res, { error: "Invalid request id" });
    }

    const request = await FriendRequest.findOne({
        _id: requestId,
        status: "PENDING",
    }).lean();

    if (!request) {
        return ok(res, { message: "Already canceled" });
    }
    if (!isSameId(request.from, meId)) {
        return forbidden(res, { error: "Not allowed" });
    }

    await FriendRequest.deleteOne({ _id: requestId });
    return ok(res, { message: "Canceled" });
});

export const listFriends = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const { limit, skip } = parsePagination(req.query);

    const [items, total] = await Promise.all([
        Friendship.find({ users: meId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("users", USER_SUMMARY_FIELDS)
            .lean(),
        Friendship.countDocuments({ users: meId }),
    ]);

    const friends = items
        .map((friendship) =>
            (friendship.users || []).find((u) => !isSameId(u._id, meId))
        )
        .filter(Boolean);

    return ok(res, {
        items: friends,
        total,
        limit,
        skip,
    });
});

export const unfriend = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const otherId = req.params.friendUserId;

    if (!isValidObjectId(otherId)) {
        return badRequest(res, { error: "Invalid user id" });
    }
    if (isSameId(meId, otherId)) {
        return badRequest(res, { error: "Invalid target" });
    }

    const pair = canonicalPair(meId, otherId);
    const pairKey = pairKeyForIds(meId, otherId);
    await Friendship.deleteOne({ $or: [{ pairKey }, { users: pair }] });
    return ok(res, { message: "Unfriended" });
});

export const getRelationshipStatus = asyncHandler(async (req, res) => {
    const meId = req.user?._id;
    const otherId = req.params.userId;

    if (!isValidObjectId(otherId)) {
        return badRequest(res, { error: "Invalid user id" });
    }
    if (isSameId(meId, otherId)) {
        return ok(res, { status: "SELF" });
    }
    if (!(await ensureUserExists(otherId, res))) return;

    const pair = canonicalPair(meId, otherId);
    const pairKey = pairKeyForIds(meId, otherId);
    const friendship = await Friendship.findOne({
        $or: [{ pairKey }, { users: pair }],
    }).lean();
    if (friendship) {
        return ok(res, { status: "FRIENDS" });
    }

    const pending = await FriendRequest.findOne({
        status: "PENDING",
        $or: [
            { from: meId, to: otherId },
            { from: otherId, to: meId },
        ],
    }).lean();

    if (pending) {
        if (isSameId(pending.from, meId)) {
            return ok(res, {
                status: "OUTGOING_PENDING",
                requestId: pending._id,
            });
        }
        return ok(res, {
            status: "INCOMING_PENDING",
            requestId: pending._id,
        });
    }

    return ok(res, { status: "NONE" });
});
