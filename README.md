# Photo Sharing App

Nguyễn Thái Bảo - PTIT
Dự án cá nhân môn Lập trình web của TS. Dương Trần Đức - PTIT.

Đây là ứng dụng chia sẻ ảnh theo mô hình MERN (MongoDB, Express, React, Node.js).
Frontend viết bằng React, backend dùng Node.js/Express và MongoDB làm cơ sở dữ liệu.
Ảnh được upload và lưu trữ trên Cloudinary.

## Tính năng
- Đăng ký/đăng nhập, hồ sơ người dùng
- Chia sẻ ảnh, xem ảnh theo người dùng
- Bình luận và reaction
- Kết bạn (gửi/nhận/huỷ lời mời)
- Dashboard admin
- Ảnh lưu trên Cloudinary

## Bảo mật
- Tách access/refresh JWT, secrets và TTL riêng
- HttpOnly cookies cho access/refresh token
- Refresh token rotation + reuse detection + revoke theo family
- Lưu hash refresh token trong DB, TTL index tự expire
- CORS credentials với `CLIENT_ORIGIN`
- Double-submit CSRF khi cross-domain (`CROSS_SITE_COOKIES=true`)
- Rate limit cho refresh endpoint
- Upload giới hạn size + allowlist MIME + kiểm tra file type thực tế

## Chạy dự án
1) Tạo file môi trường theo `.env.example`
2) Cài dependencies và chạy dev:

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd ../frontend
npm install
npm run dev
```

Ghi chú: xem `.env.example` để cấu hình các biến môi trường cần thiết.
