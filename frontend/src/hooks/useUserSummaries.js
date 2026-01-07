import { useEffect, useRef, useState } from "react";
import { api } from "../config/api";
import { API_PATHS } from "../config/apiPaths";

export default function useUserSummaries(searchTerm = "") {
    const [users, setUsers] = useState(null);
    const [allPhotos, setAllPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const photosByUserRef = useRef(new Map());

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                setLoading(true);
                setError("");

                const data = await api.get(
                    searchTerm
                        ? API_PATHS.user.search(searchTerm)
                        : API_PATHS.user.list()
                );
                if (!alive) return;
                setUsers(data);

                if (data && data.length > 0) {
                    const missing = data.filter(
                        (u) => !photosByUserRef.current.has(String(u._id))
                    );

                    if (missing.length > 0) {
                        const arrays = await Promise.all(
                            missing.map((u) =>
                                api.get(API_PATHS.photos.ofUser(u._id)).catch(() => [])
                            )
                        );
                        if (!alive) return;
                        missing.forEach((u, idx) => {
                            photosByUserRef.current.set(String(u._id), arrays[idx]);
                        });
                    }

                    const combined = data.flatMap(
                        (u) => photosByUserRef.current.get(String(u._id)) || []
                    );
                    if (!alive) return;
                    setAllPhotos(combined);
                } else {
                    setAllPhotos([]);
                }
            } catch (err) {
                if (!alive) return;
                setError(err?.message || "Không thể tải người dùng.");
                setUsers([]);
                setAllPhotos([]);
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [searchTerm]);

    const getPhotoCount = (userId) =>
        allPhotos.filter((p) => String(p.user_id) === String(userId)).length;

    const getCommentCount = (userId) => {
        let count = 0;
        allPhotos.forEach((p) => {
            const comments = p.comments || [];
            count += comments.filter((c) => (c.user?._id || c.user_id) === userId).length;
        });
        return count;
    };

    return { users, loading, error, getPhotoCount, getCommentCount };
}
