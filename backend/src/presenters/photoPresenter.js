const OPTIMIZED_TRANSFORM = 'f_auto,q_auto,w_1080';

function buildOptimizedUrl(url) {
    if (!url) return '';
    const marker = '/upload/';
    const idx = url.indexOf(marker);
    if (idx === -1) return url;
    const prefix = url.slice(0, idx + marker.length);
    const suffix = url.slice(idx + marker.length);
    return `${prefix}${OPTIMIZED_TRANSFORM}/${suffix}`;
}

export function toClient(photo, { photoReactions, commentReactions } = {}) {
    if (!photo) return null;
    const p = photo.toObject ? photo.toObject() : photo;
    return {
        ...p,
        imageUrlOptimized: p.imageUrl ? buildOptimizedUrl(p.imageUrl) : undefined,
        likeCount: p.likeCount || 0,
        dislikeCount: p.dislikeCount || 0,
        myReaction: photoReactions?.get(String(p._id)) || 0,
        comments: (p.comments || []).map((c) => ({
            _id: c._id,
            comment: c.comment,
            date_time: c.date_time,
            user: c.user || c.user_id,
            likeCount: c.likeCount || 0,
            dislikeCount: c.dislikeCount || 0,
            myReaction: commentReactions?.get(String(c._id)) || 0,
        })),
    };
}

