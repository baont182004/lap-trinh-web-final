# Photo Sharing App

Nguyễn Thái Bảo - PTIT
Dự án cá nhân môn Lập trình web TS. Dương Trần Đức - PTIT: ứng dụng chia sẻ ảnh xây dựng với Node.js/Express (backend) và React (frontend).

## Tính năng chính

- Đăng ký/đăng nhập, hồ sơ người dùng
- Chia sẻ ảnh, xem ảnh theo người dùng
- Bình luận, reaction
- Kết bạn (gửi/nhận/huỷ lời mời)
- Dashboard admin
- Ảnh lưu trên Cloudinary

## Bảo mật đã triển khai

- JWT tách access/refresh, ký bằng secrets riêng
- HttpOnly cookies cho access/refresh token
- Refresh token rotation + reuse detection + revoke theo family
- Lưu hash refresh token trong DB, TTL index tự expire
- CORS credentials với `CLIENT_ORIGIN`
- CSRF double-submit khi cross-domain (`CROSS_SITE_COOKIES=true`)
- Rate limit cho refresh token
- Upload ảnh giới hạn size + allowlist MIME + kiểm tra file type thực tế

## Cách chạy

1. Tạo file môi trường theo `.env.example`
2. Cài dependencies và chạy dev:

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
