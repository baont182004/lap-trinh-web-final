import mongoose from "mongoose";
import Photo from "../models/Photo.js";
import Reaction from "../models/Reaction.js";
import asyncHandler from "../middlewares/asyncHandler.js";
import { badRequest, notFound, ok, unauthorized } from "../utils/http.js";
import { isValidObjectId } from "../utils/validators.js";

function normalizeValue(value) {
    const parsed = Number(value);
    if (parsed === 1 || parsed === -1 || parsed === 0) return parsed;
    return null;
}

function computeNextValue(currentValue, requestedValue) {
    if (requestedValue === 0) return 0;
    if (!currentValue) return requestedValue;
    if (currentValue === requestedValue) return 0;
    return requestedValue;
}

function incForTransition(prevValue, nextValue) {
    const inc = { likeCount: 0, dislikeCount: 0 };
    if (prevValue === 1) inc.likeCount -= 1;
    if (prevValue === -1) inc.dislikeCount -= 1;
    if (nextValue === 1) inc.likeCount += 1;
    if (nextValue === -1) inc.dislikeCount += 1;
    return inc;
}

async function clampPhotoCounts(photoId, counts) {
    const updates = {};
    if (counts.likeCount < 0) updates.likeCount = 0;
    if (counts.dislikeCount < 0) updates.dislikeCount = 0;
    if (Object.keys(updates).length > 0) {
        await Photo.updateOne({ _id: photoId }, { $set: updates });
        return {
            likeCount: updates.likeCount ?? counts.likeCount,
            dislikeCount: updates.dislikeCount ?? counts.dislikeCount,
        };
    }
    return counts;
}

async function clampCommentCounts(photoId, commentObjectId, counts) {
    const updates = {};
    if (counts.likeCount < 0) updates["comments.$[comment].likeCount"] = 0;
    if (counts.dislikeCount < 0)
        updates["comments.$[comment].dislikeCount"] = 0;
    if (Object.keys(updates).length > 0) {
        await Photo.updateOne(
            { _id: photoId },
            { $set: updates },
            { arrayFilters: [{ "comment._id": commentObjectId }] }
        );
        return {
            likeCount:
                updates["comments.$[comment].likeCount"] ?? counts.likeCount,
            dislikeCount:
                updates["comments.$[comment].dislikeCount"] ??
                counts.dislikeCount,
        };
    }
    return counts;
}

function logReactionFlow({ targetType, targetId, userId, prevValue, nextValue, inc }) {
    console.info("reaction", {
        targetType,
        targetId: String(targetId),
        userId: String(userId),
        prevValue,
        nextValue,
        inc,
    });
}

export const reactToPhoto = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const photoId = req.params.photoId;
    const value = normalizeValue(req.body?.value);

    if (!userId) {
        return unauthorized(res, { error: "Unauthorized" });
    }
    if (!isValidObjectId(photoId)) {
        return badRequest(res, { error: "Invalid photo id" });
    }
    if (value === null) {
        return badRequest(res, { error: "Invalid value" });
    }

    const photo = await Photo.findById(photoId).lean();
    if (!photo) {
        return notFound(res, { error: "Photo not found" });
    }

    const existing = await Reaction.findOne({
        user: userId,
        targetType: "Photo",
        targetId: photoId,
    }).lean();

    const prevValue = existing?.value || 0;
    const nextValue = computeNextValue(prevValue, value);

    if (nextValue === 0 && existing) {
        await Reaction.deleteOne({ _id: existing._id });
    } else if (nextValue !== 0 && existing) {
        await Reaction.updateOne({ _id: existing._id }, { value: nextValue });
    } else if (nextValue !== 0 && !existing) {
        await Reaction.create({
            user: userId,
            targetType: "Photo",
            targetId: photoId,
            value: nextValue,
        });
    }

    const inc = incForTransition(prevValue, nextValue);
    const updated =
        inc.likeCount !== 0 || inc.dislikeCount !== 0
            ? await Photo.findByIdAndUpdate(
                  photoId,
                  { $inc: inc },
                  { new: true, projection: { likeCount: 1, dislikeCount: 1 } }
              ).lean()
            : photo;

    const counts = await clampPhotoCounts(photoId, {
        likeCount: updated?.likeCount ?? photo?.likeCount ?? 0,
        dislikeCount: updated?.dislikeCount ?? photo?.dislikeCount ?? 0,
    });

    logReactionFlow({
        targetType: "Photo",
        targetId: photoId,
        userId,
        prevValue,
        nextValue,
        inc,
    });

    return ok(res, {
        myReaction: nextValue,
        likeCount: counts.likeCount,
        dislikeCount: counts.dislikeCount,
    });
});

export const reactToComment = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const commentId = req.params.commentId;
    const value = normalizeValue(req.body?.value);

    if (!userId) {
        return unauthorized(res, { error: "Unauthorized" });
    }
    if (!isValidObjectId(commentId)) {
        return badRequest(res, { error: "Invalid comment id" });
    }
    if (value === null) {
        return badRequest(res, { error: "Invalid value" });
    }

    const photo = await Photo.findOne(
        { "comments._id": commentId },
        { _id: 1 }
    ).lean();

    if (!photo) {
        return notFound(res, { error: "Comment not found" });
    }

    const existing = await Reaction.findOne({
        user: userId,
        targetType: "Comment",
        targetId: commentId,
    }).lean();

    const prevValue = existing?.value || 0;
    const nextValue = computeNextValue(prevValue, value);

    if (nextValue === 0 && existing) {
        await Reaction.deleteOne({ _id: existing._id });
    } else if (nextValue !== 0 && existing) {
        await Reaction.updateOne({ _id: existing._id }, { value: nextValue });
    } else if (nextValue !== 0 && !existing) {
        await Reaction.create({
            user: userId,
            targetType: "Comment",
            targetId: commentId,
            value: nextValue,
        });
    }

    const inc = incForTransition(prevValue, nextValue);
    const commentObjectId = new mongoose.Types.ObjectId(commentId);
    if (inc.likeCount !== 0 || inc.dislikeCount !== 0) {
        await Photo.updateOne(
            { _id: photo._id },
            {
                $inc: {
                    "comments.$[comment].likeCount": inc.likeCount,
                    "comments.$[comment].dislikeCount": inc.dislikeCount,
                },
            },
            { arrayFilters: [{ "comment._id": commentObjectId }] }
        );
    }

    const updated = await Photo.findOne(
        { _id: photo._id },
        { comments: { $elemMatch: { _id: commentObjectId } } }
    ).lean();

    const updatedComment = updated?.comments?.[0];
    if (!updatedComment) {
        return notFound(res, { error: "Comment not found" });
    }

    const counts = await clampCommentCounts(photo._id, commentObjectId, {
        likeCount: updatedComment?.likeCount ?? 0,
        dislikeCount: updatedComment?.dislikeCount ?? 0,
    });

    logReactionFlow({
        targetType: "Comment",
        targetId: commentId,
        userId,
        prevValue,
        nextValue,
        inc,
    });

    return ok(res, {
        myReaction: nextValue,
        likeCount: counts.likeCount,
        dislikeCount: counts.dislikeCount,
    });
});
