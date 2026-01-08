Lập trình web TS. Dương Trần Đức
Photo Sharing App

Backend auth cookies:
- Set CLIENT_ORIGIN, NODE_ENV, CROSS_SITE_COOKIES in .env (see .env.example)
- Frontend axios/fetch must send credentials (withCredentials: true / credentials: 'include')
- If CROSS_SITE_COOKIES=true, send header x-csrf-token with value from csrf_token cookie for POST/PUT/PATCH/DELETE

Auth refresh (Postman/REST):
- POST /admin/login to receive cookies (access_token + refresh_token)
- POST /api/auth/refresh uses refresh_token cookie, rotates tokens, returns { ok: true }
- POST /api/auth/logout revokes current refresh token and clears cookies
- POST /api/auth/logout-all revokes all sessions and clears cookies
- POST /admin/logout clears cookies
