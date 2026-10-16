# Cinema .NET — hybrid MVC (Razor + Ajax) + RESTful, EF Core on Go schema

Port .NET 8 của backend Go (`D:\Code\Go\backend`), giữ nguyên React (`frontend/`, copy từ Go).

## Kiến trúc (theo concept Laravel: web + api chung Models/Services)

- **RESTful JSON** `Controllers/Api/*` → `/api/v1/*`, envelope `{code,message,data,reason,details}`,
  JSON snake_case, tương thích token/front React cũ.
- **MVC Razor** `Controllers/Web/*` + `Areas/Admin/*` → HTML shell, dữ liệu động gọi
  chính `/api/v1/*` bằng `wwwroot/js/api.js` (fetch, không framework JS).
- Chung: `Services/*` (nghiệp vụ), `Models/*` (entities), `Data/CinemaDbContext`.
- **DB: schema do migration Go quản lý duy nhất** (`D:\Code\Go\backend\migrations/schema/*.up.sql`).
  EF Core chỉ map, không `Migrate()/EnsureCreated()`.

## Auth hai mặt

- API/React: JWT Bearer HS256, claims `uid/email/role/typ`, 2 secret riêng (tương thích Go).
- Web/Razor: cookie scheme `"Web"` (`/account/login`, staff/admin only).
- Scheme mặc định `"Smart"`: có header `Authorization` → JWT, không có → cookie.
  Nên Ajax trong Razor không cần gắn token thủ công.
- `AccountStatusMiddleware`: token của account bị khóa/xóa → 403/401 ngay; role lấy từ DB.

## Chạy nhanh bằng Docker (Không cần cài .NET SDK hay Node.js)

Chỉ cần 1 lệnh duy nhất để khởi động toàn bộ hệ thống (PostgreSQL tự động migrate & seed, .NET Backend, React Frontend):

```bash
docker compose up -d --build
```

- **Frontend (Khách hàng):** [http://localhost:3000](http://localhost:3000)
- **Backend / Admin Console:** [http://localhost:5000/admin](http://localhost:5000/admin) (Đăng nhập: `admin@cinema.local` / `admin123`)
- **Swagger API Docs:** [http://localhost:5000/swagger](http://localhost:5000/swagger)

Để dừng hệ thống:
```bash
docker compose down
```

---

## Chạy thủ công trên máy host (Local Development)

1. Cài .NET 10 SDK + .NET 8 runtime (app target net8.0):
   `winget install Microsoft.DotNet.SDK.10`, `Microsoft.DotNet.Runtime.8`,
   `Microsoft.DotNet.AspNetCore.8`.
2. Postgres riêng (tránh đụng DB khác):
   `docker run -d --name cinema-postgres -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:17-alpine`
   `docker exec cinema-postgres psql -U postgres -c 'CREATE DATABASE cinema;'`
3. Chạy migration + seed theo thứ tự vào DB `cinema`
   (`backend/database/schema/*.up.sql` 000001→000012, rồi `backend/database/seed/` 010001→010006).
4. `appsettings.json`: connection string port 5433, secrets ≥ 32 ký tự.
5. `dotnet build Cinema.sln` (0 error) → `dotnet run --project backend --urls http://localhost:5000`.
6. Smoke đã pass: login admin/staff/customer (seed `admin123/staff123/customer123`),
   hold 2 ghế → pay mock → gateway IPN → confirmed + 2 vé + email outbox,
   redeem ok / quét lại used, `/admin` redirect login, SSE token.
7. React: `cd frontend && npm i && npm run dev` với `VITE_API_BASE_URL=http://localhost:5000/api/v1`.

## Tailwind cho Razor

- `tailwind.config.js` (content quét `*.cshtml` + `wwwroot/js`), `tools/tailwindcss.exe`
  (standalone v3.4, không cần npm), `backend/wwwroot/css/input.css` → `site.css`.
- Màu `brand`/`ink` + font lấy từ `frontend/src/theme/tokens.ts` — shell dark 1:1 bản gốc.
- Sửa view xong chạy: `.\tools\tailwindcss.exe -c tailwind.config.js -i backend/wwwroot/css/input.css -o backend/wwwroot/css/site.css --minify`
  (dev watch: thêm `-w`), rồi build lại (views compile lúc build).

## Ranh giới Razor / React (chốt)

- **Razor SSR** (`Areas/Admin`, cookie `Web`): console operator — `/admin` dashboard,
  `/admin/movies` (+ halls, showtimes, combos, bookings, users, promotions, pricing,
  monitoring, reports về sau), `/account/login`, trang in vé/báo cáo.
- **React** (`frontend/`, JWT Bearer): toàn bộ mặt khách (public, booking realtime,
  account) + staff **counter/check-in** (không cần SEO, giữ nguyên).
- Route React `/catalog /bookings /users /promotions /pricing-admin /monitoring`
  redirect sang console Razor (`routes/ConsoleRedirect.tsx`); menu operator chỉ còn
  dashboard + counter.

## Đã xong / còn thiếu

- Xong: envelope + errors, snake JSON, JWT tương thích Go, lockout login, refresh xoay vòng
  + chống replay, forgot/reset (file outbox), users/me + sessions + prefs + delete (ẩn danh),
  terms-accept, movies CRUD + rules F2, halls (templates, sinh ghế, clone, bulk, merge/split,
  add row/col/seat) + guards booking, showtimes (list công khai theo ngày, seatmap, CRUD +
  chống trùng giờ + buffer dọn phòng, cancel), pricing engine (base + rules) + admin,
  hold/init/refresh/cancel (merge tab, idempotency, fencing version, DB-time TTL),
  discount attach/remove, orders list/detail/transactions, counter sell, redeem + QR,
  payments (attempts, mock gateway 5 nút, IPN HMAC, return reconcile, finalize đơn +
  refund khi không ra vé), SSE realtime, combo/article/campaign/discount CRUD + public,
  staff dashboard/boxoffice/customers/collect, admin users/reports/batch/audit/orders,
  upload poster local, jobs (sweep 30s, email 2', closeDay, cleanup), audit tự động cho
  API writes, Razor console (dashboard, movies, halls, showtimes, orders, users,
  promotions, pricing, monitoring) + React đã dọn menu admin.
- Chưa có: SMTP thật (đang file outbox như Go mock), Cloudinary (đang local), PDF báo cáo,
  job queue RabbitMQ (đang cron in-process + gọi trực tiếp), TMDB import (FE gọi thẳng),
  social login (ngoài SPEC Go MVP).
- Lệch nhỏ so với Go (đã chủ ý): role check từ DB ngay (không chờ login sau); audit theo
  verb HTTP thay vì từng action; SSE không debounce 100ms; layout edit cho phép khi chỉ còn
  đơn expired (Go chặn pending/confirmed — giống nhau); rate-limit 429 trả text thuần.
