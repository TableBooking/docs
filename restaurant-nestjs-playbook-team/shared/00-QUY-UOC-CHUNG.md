# 00 — Quy ước kiến trúc chung: 5 người làm song song nhưng không đụng nhau

## Ranh giới không được phá

1. **Database per service**: `auth_db` (Người 1); `operations_db` (Người 2); `tracking_db` và `notification_db` (Người 3, tách 2 container/service); `booking_db` (Người 4). Chỉ schema và migration trong DB của mình; không FK hoặc JOIN xuyên DB. Có thể dùng 1 PostgreSQL server cho tiết kiệm, nhưng tạo 5 database và 5 role.
2. **Single writer**: Operations là nguồn sự thật `Reservation`, quyết định trạng thái và phân bàn. Booking chỉ có request + read projection; Tracking là append-only history + read projection; Notification có job/thông báo. Không ai bên ngoài Operations đổi state qua SQL.
3. **Communication**: frontend → Gateway → NestJS là HTTP. Đặt và hủy: Booking → RabbitMQ → Operations. Cập nhật trạng thái: Operations → RabbitMQ → Booking/Tracking/Notification. Không dùng synchronous HTTP để thực hiện giao dịch giữa backend services trong hot path; không chờ email mới trả response xác nhận bàn.
4. **JWT**: Auth giữ private key, bốn service khác chỉ có public key. Token dùng `sub` UUID, `role` CUSTOMER|STAFF|MANAGER, `iss=restaurant-auth`, `aud=restaurant-api`, `exp`, có `email` nếu thực sự cần. Verify tại API service, không chỉ tại Gateway. `req.user.id` được map từ `sub`.
5. **Ownership**: CUSTOMER chỉ xem/hủy của mình; STAFF/MANAGER xem tài nguyên theo quyền. Không tin `customerId` từ request body; dùng `req.user.id`. `STAFF` không được làm việc MANAGER.
6. **Time**: DB event và timestamp dùng `TIMESTAMPTZ` UTC; Operations cấu hình thời gian ca theo `Asia/Ho_Chi_Minh`. Slot id `YYYY-MM-DD-lunch|dinner`; 1 booking = 1 bàn; party size 1–12. Check-in/cancel/no-show dùng cùng một bộ guard thời gian của Operations.
7. **Mã lỗi**: JSON `{code,message,correlationId,details}`, status 400 input sai, 401 token sai, 403 vai trò sai, 404 không tìm thấy/không được xem theo policy, 409 trạng thái cũ/idempotency/table conflicts, 503 lỗi hạ tầng tạm thời khi thích hợp.
8. **Idempotency**: HTTP Booking dùng `(customerId, Idempotency-Key)` unique và payloadHash. Event listener dùng unique `eventId`; tại Operations có thêm `(bookingId, aggregateVersion)` logic để tránh cập nhật trùng.
9. **Event durability**: producer ghi nghiệp vụ + outbox **trong cùng DB transaction**; relay gửi durable/persistent message, publisher confirms/mandatory returns; consumer lưu inbox + thay đổi dữ liệu trong DB transaction, **ACK sau commit**. Crash giữa broker confirm và mark sent có thể gửi trùng; inbox phải chịu trùng.
10. **Ordering**: không giả định RabbitMQ bảo đảm toàn bộ ordering qua retry/nhiều producer. Tracking chỉ thay projection nếu `aggregateVersion` tăng; có cờ gap. Cancel đến trước Requested phải lưu pending. Message poison sau retry hữu hạn → DLQ, có thao tác replay có kiểm soát.

## Files được phép sửa (CODEOWNERS đề xuất)

| Phạm vi | Owner | Người review khi thay đổi |
|---|---|---|
| `services/auth/**`, `db/auth/**` | 1 | 4 (đầu vào JWT/Booking) |
| `infra/gateway/**`, `deploy/**`, `compose*`, `.github/workflows/**` | 1 | 5 (FE), 2/3/4 nếu đổi route |
| `services/operations/**`, `db/operations/**` | 2 | 4 (event producer/consumer) |
| `services/tracking/**`, `services/notification/**`, `db/tracking/**`, `db/notification/**` | 3 | 2 (state event) |
| `services/booking/**`, `db/booking/**` | 4 | 2 (request event) |
| `restaurant-web/src/**` | 5 | Service owner liên quan tới API |
| `shared/**`, `contracts/**`, SQL init, shared events/rabbit | Theo PR đề xuất, không có người sửa đơn phương | **Ít nhất 2 bên producer–consumer hoặc owner Gateway/FE** |

## Contract freeze: thứ tự thỏa thuận trước khi code

- Người 1: cung cấp JWT dev public key, claim mẫu và test verify, các route `/api/**`, CORs/cookie policy, danh sách cổng.
- Người 2 + 4: thống nhất 4 event (tên/routing key/envelope), `aggregateVersion`, `commandId`, cancellation result, state transitions và thời gian slot. Người 3 ký duyệt payload `state-changed` phục vụ timeline/email.
- Người 5: `OpenAPI V2` + generated TypeScript types; không phát minh API trong FE, không sửa trực tiếp file generated.
- Cần thay contract? PR `contracts/...` riêng, có version mới khi breaking change. Hai phía cập nhật tests trước khi merge. Không đổi đồng thời field âm thầm (`email` → `contactEmail`, `version` → `aggregateVersion`).

## Definition of Ready → Done

**Ready:** API request/response mẫu; auth & role; DB owner; error cases; event payload; consumer behavior; test cases viết rõ.

**Done:** migration chạy từ DB trống; service run local và Docker; các API trong scope có success + errors tests; duplicate-safe event; log có correlationId; no DB cross-access; README và env example; smoke qua Gateway; PR được review; service hoạt động khi Notification down nếu không trực tiếp phụ thuộc nó.

## Quy tắc tránh conflict

- Repo `restaurant-platform` (backend monorepo), repo `restaurant-web` (FE). Tạo PR nhỏ 1 feature, không làm branch dài cả kỳ.
- Không commit secrets/keys, `.env`, `node_modules`, `dist`, database volumes. Chỉ commit `.env.example`.
- Người 1 sở hữu Compose + gateway; người 5 không tự sửa Compose khi muốn route FE mà mở issue/PR có review; người 2/3/4 không tự sửa shared helper để phù hợp DB mình mà báo cần thay contract.
- Khởi tạo DB bằng **migrations versioned**; không chạy SQL init V1 rồi thêm SQL target V2 lên trên mà không migration.
- `docker compose down -v` chỉ khi chủ động reset môi trường cá nhân, không dùng trên máy demo chung.

## Thứ tự release/integration

Tạo môi trường ở tuần 1 với broker + schema + Auth public key + Gateway healthy; tách e2e integration theo bước có thể chạy lặp. Tag image theo commit SHA, không deploy image `latest` không thể truy vết. Rollback bằng tag trước đó, với DB migration phải kiểm tra backward compatibility trước rollback.
