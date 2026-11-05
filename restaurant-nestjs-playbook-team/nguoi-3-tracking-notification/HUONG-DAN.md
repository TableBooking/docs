# NGƯỜI 3 — TRACKING SERVICE + NOTIFICATION SERVICE (2 DEPLOYMENTS, 2 DATABASES)

**Phạm vi:** `services/tracking/**`, `services/notification/**`, `db/tracking/**`, `db/notification/**`. **Hai service phải độc lập**: không được gộp controller, DB, transaction hay container chỉ vì một người làm cả hai. **Giao tiếp:** chỉ nhận `booking.state-changed.v1` từ Operations qua các **queue riêng**; frontend gọi HTTP qua Gateway.

## A. Tách nhiệm vụ rõ ràng

| Thành phần | Nhận input | Sở hữu dữ liệu | Đầu ra |
|---|---|---|---|
| **Tracking** | `tracking.lifecycle.q` từ `restaurant.events` | `tracking_db`: history và projection | 2 API GET timeline/status; KHÔNG phát state mới |
| **Notification** | `notification.lifecycle.q` từ exchange đó | `notification_db`: job, delivery attempt, preferences | 6 API thông báo; worker SMTP/Mailpit; KHÔNG thay đổi reservation state |

Nếu Notification tắt, Tracking vẫn nhận đủ sự kiện trên queue của mình. RabbitMQ phải tạo queue/binding của Notification **trước khi** Notification bị tắt; thông điệp persistent nằm trong durable queue cho tới lúc service chạy lại.

---

# PHẦN 1: TRACKING SERVICE

## B. Nghiệp vụ Tracking

1. Mỗi state event hợp lệ được ghi thành một dòng lịch sử bất biến theo `(bookingId, aggregateVersion)`; `eventId` unique. Không sửa state cũ đã ghi, không tự phát minh thêm state.
2. `reservation_projection` là bản sao trạng thái mới nhất cho chức năng đọc. Event version thấp đến sau vẫn có thể thêm vào history nhưng **không được ghi đè projection phiên bản cao hơn**.
3. Phát hiện gap (ví dụ nhận version=3 khi projection hiện version=1) → `gap_detected=true`, ghi metric/log và mở đường replay; không tự suy luận version=2.
4. Ownership: CUSTOMER chỉ xem timeline/status của `customerId` tương ứng với `req.user.id`; STAFF/MANAGER theo quyền. Không gọi Auth DB; so sánh principal từ JWT với `customer_id` của chính Tracking.
5. UI hiển thị timeline sort theo `aggregateVersion`, không sort theo `receivedAt` khi cần đúng thứ tự nghiệp vụ. Có thể hiển thị occurredAt và receivedAt riêng để debug.

## C. Database `tracking_db`

| Table | Các cột, khóa | Ý nghĩa |
|---|---|---|
| `reservation_history` | `event_id UUID PK`, `booking_id UUID`, `customer_id UUID`, `aggregate_version INT`, `previous_state`, `state`, `actor_id`, `reason`, `occurred_at`, `received_at` | Append-only; unique `(booking_id, aggregate_version)` |
| `reservation_projection` | `booking_id UUID PK`, `customer_id`, `state`, `aggregate_version`, `gap_detected`, `updated_at` | Read model, update chỉ khi version mới cao hơn |
| `inbox_events` | `event_id UUID PK`, `processed_at` | Idempotency event handler |

SQL: `../sql/tracking_schema_V2.sql`. Không FK đến Operations hoặc Booking. Cần index `(booking_id,aggregate_version)`.

## D. Hai API Tracking

1. `GET /api/tracking/bookings/{id}/timeline`: kiểm tra JWT và quyền; lấy history tăng dần theo version, trả `{data,meta}` hoặc shape chính xác trong OpenAPI; nếu không có quyền áp policy 404/403 đã chốt. Trạng thái `REQUESTED` có version=1.
2. `GET /api/tracking/bookings/{id}/status`: kiểm tra quyền; trả projection mới nhất cùng `aggregateVersion`, `gapDetected` nếu hợp đồng cho phép. Khi projection chưa có do eventual consistency, trả trạng thái pending/not-found theo policy rõ ràng, không tự truy vấn DB Operations.

## E. Tracking consumer transaction (mẫu logic)

```ts
await db.tx(async (tx) => {
  if (!(await inboxRepository.markIfNew(tx, ev.eventId))) return;
  await historyRepository.insertIfNotExists(tx, {
    eventId: ev.eventId, bookingId: ev.aggregateId,
    customerId: ev.data.customerId, version: ev.aggregateVersion,
    previousState: ev.data.previousState, state: ev.data.state,
    occurredAt: ev.occurredAt, actorId: ev.data.actorId, reason: ev.data.reason,
  });
  const old = await projectionRepository.lockOrRead(tx, ev.aggregateId);
  if (!old || ev.aggregateVersion > old.aggregateVersion) {
    await projectionRepository.upsertOnlyIfNewer(tx, ev, old);
  }
});
// handler thành công / DB commit -> RabbitMQ ACK. Failed -> retry (no ACK).
```

Để chống race khi concurrent workers, câu `UPSERT ... WHERE reservation_projection.aggregate_version < EXCLUDED.aggregate_version` phải được dùng; không chỉ compare trong JS. Nếu lỗi unique `(booking_id,aggregate_version)` với hai eventId khác nhau nhưng payload khác → báo inconsistency và chuyển xử lý thủ công, không lặng im ghi đè.

**Tests Tracking:** duplicate eventId chỉ 1 history; version 3 đến trước 2 projection vẫn 3; version 2 bổ sung history; eventId khác nhưng cùng version payload xung đột bị phát hiện; customer khác đọc 404/403; Notification down vẫn ghi lịch sử; broker tắt/restart không mất trạng thái đã commit.

---

# PHẦN 2: NOTIFICATION SERVICE

## F. Nghiệp vụ Notification

1. Nhận `booking.state-changed.v1`, validate schema, map state thành loại thông báo (REQUESTED nhận yêu cầu, CONFIRMED xác nhận, REJECTED từ chối, CANCELLED hủy, CHECKED_IN/SEATED/COMPLETED/NO_SHOW theo policy cần gửi). Không phải state nào cũng cần email, nhưng timeline/in-app có thể đầy đủ.
2. Trong transaction: dedup `eventId` inbox và insert `notification_jobs` (eventId unique), **không gửi SMTP bên trong transaction**. Sau commit, ACK RabbitMQ.
3. Worker riêng poll các job đến hạn, claim an toàn trong DB (`FOR UPDATE SKIP LOCKED` hoặc lease), gửi email qua SMTP/Mailpit, ghi `delivery_attempts`, đánh dấu SENT hoặc RETRY/FAILED theo backoff hữu hạn. Không giữ DB transaction đang mở trong lúc gửi SMTP.
4. Nếu email lỗi, **job vẫn tồn tại** và có thể retry. Nếu service tắt, queue Notification tích message; khi chạy lại inbox ngăn tạo job trùng. Gửi SMTP có thể bị trùng khi crash sau send trước mark SENT: báo đúng giới hạn at-least-once, cân nhắc message-id/provider idempotency.
5. Tách thông báo in-app và email preference. `email_enabled=false` có thể vẫn ghi in-app nếu `in_app_enabled=true`; preference không ảnh hưởng kết quả reservation tại Operations.
6. Chỉ customer sở hữu notification được xem/mark read; list phải phân trang; không đưa email cá nhân vào log lỗi/correlation traces một cách tùy tiện.

## G. Database `notification_db`

| Table | Cột và ràng buộc | Ý nghĩa |
|---|---|---|
| `notification_jobs` | `id UUID PK`, `event_id UUID UNIQUE`, `booking_id`, `customer_id`, `recipient_email`, `type`, `title`, `message`, `delivery_status`, `attempts`, `next_attempt_at`, `sent_at`, `last_error`, `read_at`, `created_at` | In-app + email job bền vững |
| `notification_delivery_attempts` | `id BIGSERIAL PK`, `job_id FK`, `attempt_number`, `success`, `error_message`, `attempted_at` | Lịch sử gửi; unique `(job_id,attempt_number)` |
| `notification_preferences` | `customer_id UUID PK`, `email_enabled`, `in_app_enabled`, `updated_at` | Sở thích nhận thông báo |
| `inbox_events` | `event_id UUID PK`, `processed_at` | Consumer dedup |

SQL: `../sql/notification_schema_V2.sql`. `customer_id` logic ref sang Auth nhưng **không FK**. `recipient_email` lấy snapshot `data.email` trong state event; Notification không gọi Auth mỗi event.

## H. Sáu API Notification

| API | Nghiệp vụ |
|---|---|
| `GET /api/notifications/mine` | Danh sách job của current user, sort mới nhất và pagination; không lộ người khác |
| `GET /api/notifications/unread-count` | Đếm job `read_at IS NULL` dành cho current user |
| `POST /api/notifications/{id}/read` | Mark read theo notification **id**; idempotent; nguồn V1 đang dùng `:eventId/read` nên **adapt** |
| `POST /api/notifications/read-all` | Đánh dấu tất cả current user; trả số dòng thay đổi |
| `GET /api/notifications/preferences` | Lấy prefs (default true/true nếu chưa tạo) |
| `PATCH /api/notifications/preferences` | Upsert prefs theo `req.user.id`, validate boolean |

Trường response dùng chuẩn OpenAPI, không return bản ghi raw snake_case. Tham chiếu API group Notification trong `contracts/openapi/restaurant-api-v2.yaml`.

## I. Cấu trúc modules nên tạo

```text
services/tracking/
├── main.ts
├── tracking.module.ts
├── controllers/{timeline,status}.controller.ts
├── messaging/state-changed.consumer.ts
├── application/history.service.ts
├── infrastructure/{history,projection,inbox}.repository.ts
└── migrations/001_tracking.sql
services/notification/
├── main.ts
├── notification.module.ts
├── controllers/{notification,preference}.controller.ts
├── messaging/state-changed.consumer.ts
├── application/{notification,delivery-worker,preference}.service.ts
├── infrastructure/{job,attempt,preference,inbox}.repository.ts
└── migrations/001_notification.sql
```

## J. Tuần làm việc (vì 2 service nên phải chia rõ)

- [ ] **Tuần 1:** test event schema với Người 2, chạy hai DB riêng; hoàn thành Tracking consumer + timeline cơ bản.
- [ ] **Tuần 2:** Tracking projection gap, ownership và status API, unit test out-of-order; chốt event fixture với Operations.
- [ ] **Tuần 3:** Notification consumer → persist job + ACK; `GET mine`, mark read; Mailpit worker.
- [ ] **Tuần 4:** Retry/backoff + delivery history; unread count/prefs/read-all; 6 API hoàn chỉnh.
- [ ] **Tuần 5:** Duplicate/DLQ/outage/recovery tests; dashboard RabbitMQ queue metrics và E2E với Người 2/4.
- [ ] **Tuần 6:** support FE timeline/notifs, demo tắt Notification, replay và báo cáo.

## K. Giao diện / đối soát với nhóm

- Người 2 bắt buộc phát event `state-changed` có `aggregateVersion`, `data.email`, `customerId`, `previousState/state`, `tableId`, `actorId`, occurredAt/commandId. Người 3 viết fixture schemas để CI phát hiện breaking changes.
- Người 4 không gọi Tracking để xác nhận có bàn; chỉ dùng Booking/Operations. Người 5 polling từ Booking/Tracking, không coi Notification là nguồn state.
- Người 1 phải provision **cả** `tracking.lifecycle.q` và `notification.lifecycle.q` trước khi ngắt service; nếu queue chưa từng được khai báo, sẽ không có backlog khi Notification tắt.

**Definition of Done:** Tracking 2 API + history/projection/out-of-order; Notification 6 API + inbox/job/worker/Mailpit/retry; hai DB migration; two containers; failover Notification test; docs env + ownership tests. Không cần phát thêm event từ hai service trong MVP.
