# NGƯỜI 1 — AUTH SERVICE + API GATEWAY + NỀN TẢNG DEPLOY

**Phạm vi code:** `services/auth/**`, `db/auth/**`, `infra/gateway/**`, `deploy/**`, `compose.yaml`, CI. **DB:** `auth_db` riêng. **Phối hợp:** đưa public key và JWT contract cho 2/3/4; route API và mock/FE proxy cho 5. **Phần kế hoạch chi tiết deploy:** `../deploy/GIT-LOCAL-CICD-PROD.md`.

## A. Chức năng và nghiệp vụ Auth

1. Đăng ký: khách tự đăng ký thành `CUSTOMER`, trạng thái `active=true`. Client không tự chọn STAFF/MANAGER. Email chuẩn hóa lowercase và unique case-insensitive; password không lưu plaintext.
2. Đăng nhập: email + password; nếu đúng và user active thì cấp **access JWT RS256** (gợi ý 15 phút), tạo refresh session. Sai credentials trả 401 chung, không tiết lộ tài khoản có tồn tại.
3. Refresh: sử dụng refresh token trong HttpOnly cookie; hash token vào database, dùng transaction khóa session cũ `FOR UPDATE` để **rotation** và chống reuse; trả access JWT mới, thay cookie.
4. Logout: revoke refresh session hiện hành, clear cookie. Access JWT cũ vẫn có thể dùng đến khi hết hạn nếu không dùng revocation list; nêu rõ giới hạn.
5. Profile: `GET/PATCH users/me` chỉ sửa `fullName`, `phone`; role/active/email không được thay bằng mass assignment.
6. Đổi password: xác thực password cũ, cập nhật hash, revoke tất cả refresh sessions thuộc tài khoản.
7. MANAGER tạo STAFF; quản lý danh sách nhân viên, khóa/mở nhân viên; manager đầu tiên tạo bằng bootstrap script an toàn, **không có public register manager**.
8. Tất cả service khác verify JWT cục bộ bằng **public key**; không cần Auth luôn online để xử lý access JWT còn hợp lệ.

## B. Schema `auth_db` (nguồn: `../sql/auth_schema_V2.sql`)

| Bảng | Cột bắt buộc | Constraint / transaction |
|---|---|---|
| `users` | `id UUID`, `email`, `password_hash`, `full_name`, `phone`, `role`, `active`, `created_at`, `updated_at` | PK `id`, unique `lower(email)`, `role` chỉ CUSTOMER/STAFF/MANAGER |
| `refresh_sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at`, `device_label`, `last_used_at` | FK tới users **cùng DB**; unique token_hash; index (user_id, expires_at) |

**Không gửi** `password_hash`, refresh token hoặc private key vào event RabbitMQ. Test/seed user qua API/CLI script tạo hash thật; không seed cố định mật khẩu vào SQL.

## C. Danh sách 10 API và đầu việc

| API | Input trọng tâm | Xử lý bắt buộc |
|---|---|---|
| `POST /api/auth/register` | email, password, fullName, phone? | Validate, normalize, hash, insert, duplicate 409 → 201 User |
| `POST /api/auth/login` | email, password | Verify hash, active, create session, set cookie → 200 AuthTokens |
| `POST /api/auth/refresh` | HttpOnly refresh cookie | Revoke old + insert new in **1 transaction** → 200 |
| `POST /api/auth/logout` | refresh cookie | Revoke (idempotent), clear cookie → 200 |
| `POST /api/auth/change-password` | oldPassword, newPassword | guard JWT, revoke all sessions, no password in response |
| `GET /api/users/me` | JWT | Get profile theo `sub`; 404 nếu user không còn tồn tại |
| `PATCH /api/users/me` | fullName?, phone? | Allowlist fields; không sửa role/active |
| `GET /api/users/staff` | page/limit? | chỉ MANAGER; pagination, không trả hash |
| `POST /api/users/staff` | email, password, fullName | chỉ MANAGER; role hardcoded STAFF |
| `PATCH /api/users/{id}/status` | active:boolean | chỉ MANAGER; chặn khóa manager cuối cùng nếu hỗ trợ |

**Response/DTO cụ thể phải dùng đúng** `contracts/openapi/restaurant-api-v2.yaml`. API V1 đã có register/login/refresh/logout/me/create-staff; còn lại triển khai mới hoặc sửa hành vi.

## D. Các file/module cần tạo từ starter

```text
services/auth/
├── main.ts                 # V1 entrypoint; tách logic dần
├── auth.module.ts
├── controllers/auth.controller.ts
├── controllers/users.controller.ts
├── dto/register.dto.ts, login.dto.ts, profile.dto.ts, staff.dto.ts
├── application/auth.service.ts, users.service.ts
├── infrastructure/user.repository.ts, refresh-session.repository.ts
├── security/jwt-issuer.service.ts, password.service.ts
└── migrations/001_create_auth.sql, 002_add_refresh.sql
infra/gateway/nginx.conf
scripts/bootstrap-manager.ts     # chỉ chạy quản trị, không public API
```

NestJS nên dùng DTO + ValidationPipe, hoặc validator đã thống nhất. Không bắt buộc TypeORM/Prisma; dự án V1 dùng `pg`, giữ `pg` với repository phân tầng sẽ ít thay đổi. `shared/identity.ts` phải map claims `sub` → `req.user.id` và validate `iss/aud/exp/alg`.

## E. JWT contract phải phát ngay cho các owner khác

```json
{
  "sub":"f6c2ae37-417c-4c08-9fb9-a13fe5c6797f",
  "email":"customer@example.test",
  "role":"CUSTOMER",
  "iss":"restaurant-auth",
  "aud":"restaurant-api",
  "iat":1793970000,
  "exp":1793970900
}
```

Thời gian trong ví dụ là cấu trúc minh họa; khi sign token thật phải dùng Unix timestamp từ runtime. Chỉ Auth giữ `private.pem`, bốn service khác mount `public.pem` read-only. Khi chuyển JWKS, có cache/rotation để server Auth tắt tạm thời không làm hỏng request JWT còn hiệu lực.

## F. API Gateway — công việc cụ thể

- V1 đang dùng Nginx (`infra/gateway/nginx.conf`). Chốt `/api/auth/**`, `/api/users/**` → auth; `/api/bookings/**` → booking; `/api/operations/**`, `/api/restaurants/**`, `/api/slots`, `/api/availability` → operations; `/api/tracking/**` → tracking; `/api/notifications/**` → notification; `/` → React static. Giữ API health `/api/health` của Gateway.
- Định tuyến **path giữ nguyên**. Nếu backend controller có prefix `api/`, proxy_pass phải test chính xác, tránh `/api/api` hoặc mất prefix.
- Bật request size limit, timeout phù hợp, request/correlation ID và HTTPS khi deploy. Rate limit login/refresh; có thể làm Nginx limit_req và app-level limit.
- Browser cùng origin `https://your-domain/` và `/api/...` để giảm CORS; cấu hình refresh cookie HttpOnly+Secure trong HTTPS, SameSite theo domain deploy. Không cho FE đọc refresh cookie từ JS.
- Gateway **không** được ghi DB hoặc quyết định trạng thái; không coi Gateway JWT check là thay thế service-level guards.
- RabbitMQ/PostgreSQL không public port; chỉ reverse proxy public 80/443. Giao diện RabbitMQ management chỉ truy cập nội bộ/VPN/SSH tunnel.
- Compose cho 5 backend + 1 web + gateway + broker + PostgreSQL + Mailpit; trên dev source V1 hiện `web` build từ `../restaurant-web` ⇒ clone 2 repo ở hai folder ngang hàng.

## G. Lộ trình implement (checklist tuần)

- [ ] **Tuần 1**: Khóa JWT contract + private/public key dev + 5 DB credentials tách biệt; Gateway route toàn bộ 41 API; Auth đăng ký/login/me; cung cấp access JWT demo cho từng người.
- [ ] **Tuần 2**: Refresh/logout rotation + profile/change-password; bootstrap manager; tests quyền; compose nội bộ; kiểm tra `/api/health`.
- [ ] **Tuần 3**: List/create/lock STAFF; cookie và error envelope chuẩn; cập nhật OpenAPI Auth; hỗ trợ người 5 login flow.
- [ ] **Tuần 4–5**: CI matrix test/build service theo path, Docker image tag SHA, healthchecks/readiness, staging; security test.
- [ ] **Tuần 6**: VPS HTTPS, secrets, backup, rollback và demo Auth container restart mà Booking vẫn verify JWT cũ hợp lệ.

## H. Test độc lập + tích hợp

- Register CUSTOMER không thể gửi `role=MANAGER`; email viết hoa trùng email viết thường → 409.
- Login sai password, user bị khóa → 401; role thiếu → 403; refresh reuse → 401; logout rồi refresh → 401.
- JWT giả, sai `aud`/`iss`, expired, signed bằng HS256 → 401 tại **Booking/Operations/Tracking/Notification**, không chỉ Gateway.
- CUSTOMER gọi `POST /api/users/staff` → 403; MANAGER thành công; PATCH profile không sửa role.
- Tắt Auth sau khi login, request GET Booking/Tracking bằng access JWT còn hạn vẫn được xác minh bởi service khác.
- Cùng một URL hoạt động bằng Gateway (không được dùng port service trực tiếp từ FE). Mở Postman collection và chạy dưới baseURL Gateway.

**Bàn giao cho nhóm:** `auth_db` migration; 10 endpoint; JWT test token + public key dev; env contract; Gateway nginx, Compose, CI, README và bảng route. Không cần RabbitMQ cho Auth MVP.
