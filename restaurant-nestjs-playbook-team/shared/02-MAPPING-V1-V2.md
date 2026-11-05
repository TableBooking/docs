# 02 — MAPPING SOURCE NESTJS V1 SANG MÔ HÌNH V2 (BẮT BUỘC ĐỌC)

Bộ source `restaurant-nestjs-v2-full-spec-mock.zip` vẫn chứa NestJS starter V1: mỗi service 1 file `services/<name>/main.ts`, `pg`, `shared/events.ts`, `shared/rabbit.ts`, `shared/schemas.ts`. `contracts/openapi/restaurant-api-v2.yaml` và `db/*/schema.sql` trong ZIP là mục tiêu V2 **không tương thích tự động** với SQL auto-init V1.

| Điểm lệch | Source V1 | Target V2 | Owner phải sửa |
|---|---|---|---|
| Database init | `shared/schemas.ts` tự create V1 khi boot | migrations versioned trên DB target | 1 setup + mỗi DB owner |
| Booking email | `booking_requests.email` | `booking_requests.contact_email` | 4 |
| Booking state | `booking_projection.version` | `aggregate_version`; state có thể null/pending | 4 |
| Operations state | `reservations.version`, `reservations.email` | `aggregate_version`, `contact_email` | 2 |
| Tables | `dining_tables.area` text | `area_id` FK nội bộ, `dining_areas` | 2 |
| Slot config | `service_slots.starts_at/ends_at` | `service_slot_configs.starts_at_local/ends_at_local` | 2 |
| Pending cancel | V1 có `reason/created_at` | V2 có `customer_id/received_at` | 2 |
| Tracking history | `version` | `aggregate_version` và `received_at` | 3 |
| Notification job | `event_id` PK | `id UUID` PK, `event_id` unique, type/title/message | 3 |
| Outbox helper | `enqueue()` inserts 3 fields | outbox V2 needs `aggregate_id` too | 2 + 4 review `shared/events.ts` |
| Inbox helper | `inbox()` inserts only eventId | Booking/Operations V2 requires `aggregate_id` | 2 + 4, 3 review helper |
| Rabbit event DTO | V1 accepts `data.email` | Contract V2 currently also uses `data.email`, DB column is contact_email | 2 + 3 + 4: **keep event email** unless version bump |
| JWT | V1 public.pem/RS256 | Keep claim/alg/iss/aud, harden refresh, ownership | 1 |
| Notification mark read | V1 `POST /:eventId/read` | V2 `POST /:id/read` is notification job ID | 3 + 5 adapt |
| API response | Raw arrays/snake_case V1 | camelCase + `{data,meta}` where OpenAPI specifies | Mỗi API owner + 5 |
| Party size | V1 có giới hạn khác V2 ở một số chỗ | 1–12 theo OpenAPI V2 | 2 + 4 |
| Operations time guard | V1 chủ yếu canTransition() | Thêm check-in/cancel/no-show time policies | 2 |
| Gateway routing | V1 có routes một phần | Thêm `/api/restaurants`, `/api/slots`, `/api/availability` | 1 |
| SMTP job handling | V1 có thể gửi SMTP trong DB transaction | Transaction để claim/mark, SMTP bên ngoài tx | 3 |
| Shared queue provisioning | V1 mỗi instance assert topology | Provision toàn bộ queues trước demo outage; thống nhất deploy | 1 + 3 |

## Chiến lược migration an toàn được chốt

1. Tạo branch `chore/migrations-v2` và DB dev **mới**, không migrate phá dữ liệu DB V1 đang dùng khi chưa có script upgrade.
2. Mỗi owner đặt `migrations/001_init.sql` từ target `sql/*_schema_V2.sql`; tắt `shared/schemas.ts` auto-init khi chạy target V2 (feature flag hoặc remove).
3. Refactor `shared/events.ts` **được cả 2/3/4 review** để outbox/inbox sử dụng đúng schema. Có thể có `markInbox(client, eventId, aggregateId, aggregateVersion?)`; với Tracking/Notification schema inbox ít field hơn, nên chọn wrapper theo DB/service, không dùng một insert chung giả định mọi inbox có cùng cột.
4. Sửa toàn bộ query trong main.ts theo cột target; code TypeScript build + unit query integration tests trước khi chạy service.
5. FE dùng mock contract V2 cho tới khi backend API match; không biến V1 raw array thành chuẩn mới.
6. Chạy fresh Compose database, seed Operations; nếu cần upgrade DB dữ liệu thật, phải viết migration `ALTER TABLE` theo từng revision riêng (không dùng schema.sql V2 để upgrade dữ liệu cũ).

## Quy tắc kiểm tra migration

- Chạy SQL target trên DB trống, lần hai không tạo dữ liệu trùng.
- Role backend chỉ quyền CRUD database của mình, không quyền vào DB khác.
- Gọi đầy đủ API sau migration; đặc biệt INSERT outbox, INSERT inbox, event replay, version fields, `table_allocations` unique.
- Test nguồn V1 và target V2 trên **môi trường riêng**, không sử dụng chung volume Postgres.
