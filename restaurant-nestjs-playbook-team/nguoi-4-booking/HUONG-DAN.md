# NGƯỜI 4 — BOOKING SERVICE (5 API + YÊU CẦU/HỦY SỰ KIỆN)

**Owner:** Người 4. **Source V1:** `services/booking/main.ts`. **DB:** `booking_db`. **RabbitMQ:** produce `booking.requested.v1`, `booking.cancel-requested.v1`; consume `booking.state-changed.v1`, `booking.cancellation-rejected.v1`. **Tuyệt đối không gán tableId hay xác nhận booking tại đây** — Operations là single writer.

## A. Nghiệp vụ Booking

1. CUSTOMER/STAFF/MANAGER xác thực bằng JWT; lấy `customerId` theo `req.user.id` cho tự đặt. Nếu STAFF thay khách đặt hộ trong tương lai, cần contract đại diện khách và audit riêng, không tùy tiện chấp nhận `customerId` ở body.
2. Khách chọn ngày/ca (slot theo `YYYY-MM-DD-lunch|dinner`), số lượng 1–12, thông tin liên hệ/ghi chú; `POST /api/bookings` có `Idempotency-Key`. Validate input; nên kiểm tra slot trong tương lai theo format/clock và để Operations là authority xác nhận slot còn active/chỗ trống.
3. Ghi **`booking_requests` + `outbox_events` trong cùng PostgreSQL transaction**. Trả `202 Accepted` với `{bookingId, processingStatus:'QUEUED'}`; **không trả CONFIRMED** vì Operations chưa cấp bàn.
4. Relay phát event `booking.requested.v1`, confirm broker; Operations tạo REQUESTED và phát state event. Booking consume để cập nhật `booking_projection` và `processing_status=PROCESSED`. Frontend có thể polling GET mine/detail tới khi nhận state.
5. Khách yêu cầu hủy bằng `POST .../cancellation-requests`, chỉ owner, record `cancellation_commands` status PENDING + outbox `booking.cancel-requested.v1` atomic → 202. **Đây chưa phải đã hủy thành công**.
6. Operations quyết định: nếu hợp lệ phát `booking.state-changed.v1` state CANCELLED kèm `commandId`; Booking mark command ACCEPTED; nếu hủy không hợp lệ phát `booking.cancellation-rejected.v1`, Booking mark REJECTED + reason. Endpoint `GET .../commands/{commandId}` phải phản ánh trạng thái thật.
7. Không gọi Notifications hoặc Tracking đồng bộ; dữ liệu projection của Booking có thể chậm vài giây. Dùng `aggregateVersion` để tránh lùi state khi event đến sai thứ tự.

## B. Schema `booking_db`

SQL: `../sql/booking_schema_V2.sql`.

| Bảng | Cột chính/constraint | Dùng ở đâu |
|---|---|---|
| `booking_requests` | `id UUID PK`, `customer_id`, `contact_email`, `contact_phone`, `slot_id`, `party_size 1..12`, `note`, `idempotency_key`, `payload_hash`, `processing_status`, `created_at` | POST bookings, list mine, GET detail; unique `(customer_id,idempotency_key)` |
| `booking_projection` | `booking_id UUID PK`, `customer_id`, `state`, `aggregate_version`, `table_id`, `updated_at` | GET detail/mine, nhận state event; only update if new version higher |
| `cancellation_commands` | `command_id UUID PK`, `booking_id FK LOCAL`, `customer_id`, `status PENDING|ACCEPTED|REJECTED`, `reason`, `created_at`,`resolved_at` | POST cancel + GET command status |
| `outbox_events` | `event_id`, `aggregate_id`, `routing_key`, `payload JSONB`, `attempts`, `published_at` | Durable event publisher |
| `inbox_events` | `event_id`, `aggregate_id`, `aggregate_version`, `processed_at` | Consumer dedup |

Không FK sang Operations/Auth; `customer_id`/`booking_id` chỉ là logical identifiers. `payload_hash` tính từ canonicalized booking request (các trường có ảnh hưởng nghiệp vụ), cùng key + cùng payload trả cùng receipt; cùng key + payload khác trả **409**.

## C. 5 API và tất cả nhánh xử lý

| API | HTTP | Đầu vào / response | Cần xử lý |
|---|---|---|---|
| `POST /api/bookings` | 202 | Header `Idempotency-Key`, JSON `slotId, partySize, note, contactPhone?` | Validate 400, JWT 401, key reused different body 409; tx request+outbox |
| `GET /api/bookings/mine` | 200 | JWT; query page/limit | Chỉ trả owner, join **nội bộ** request+projection, pending khi projection chưa tới |
| `GET /api/bookings/{id}` | 200 | UUID id; JSON booking+state/version/table | Owner hoặc STAFF/MANAGER; 404 nếu không thuộc quyền theo policy |
| `POST /api/bookings/{id}/cancellation-requests` | 202 | JWT, optional reason/header idempotency theo contract | Tạo command PENDING + outbox; không sửa state tức thì; không nhận hủy người khác |
| `GET /api/bookings/commands/{commandId}` | 200 | UUID commandId | Trả PENDING/ACCEPTED/REJECTED và reason; owner check |

DTO, responses chi tiết và header naming **chốt trong OpenAPI V2**. Nếu OpenAPI yêu cầu `contactEmail` thì không dựa vào email body của khách làm identity; có thể dùng JWT email verified làm snapshot (hoặc user profile nếu chốt chính sách cập nhật). Không lộ booking của người khác qua ID đoán được.

## D. Luồng SQL transaction cần code

**Đặt bàn có Idempotency-Key**:

```ts
return db.tx(async tx => {
  const old = await requestRepo.findByCustomerAndKey(tx, user.id, key);
  if (old) {
    if (old.payloadHash !== hashCanonical(dto)) throw new ConflictException('IDEMPOTENCY_CONFLICT');
    return receipt(old); // không publish event mới
  }
  const bookingId = randomUUID();
  await requestRepo.insert(tx, {bookingId, customerId:user.id, ...dto, idempotencyKey:key});
  await outboxRepo.insert(tx, requestedEvent(bookingId, dto, user));
  return {bookingId, processingStatus:'QUEUED'};
});
```

**Cancellation**:

```ts
await db.tx(async tx => {
  const booking = await requestRepo.findOwned(tx, bookingId, user.id);
  if (!booking) throw new NotFoundException();
  const commandId = randomUUID();
  await cancellationRepo.insert(tx, {commandId, bookingId, customerId:user.id, status:'PENDING'});
  await outboxRepo.insert(tx, cancellationRequestedEvent(commandId, bookingId, user.id));
});
// Trả 202, FE hiển thị 'Đang xử lý yêu cầu hủy'.
```

Cancel lặp lại nhanh có thể tạo nhiều commands nếu không có policy; chọn **một pending cancellation cho mỗi booking** hoặc dùng command-level idempotency key, cập nhật schema/index nếu quyết định. Phải chốt với Người 2 trước tuần 2.

## E. Event contract (đồng bộ người 2 và 3)

| Event | Producer / consumer | Payload chính |
|---|---|---|
| `booking.requested.v1` | Booking → Operations queue | `aggregateId=bookingId`, `data: {customerId,email,slotId,partySize,note?,contactPhone?}` |
| `booking.cancel-requested.v1` | Booking → Operations queue | `aggregateId=bookingId`, `data:{commandId,customerId,reason?}` |
| `booking.state-changed.v1` | Operations → Booking lifecycle queue | `aggregateVersion`, `data:{previousState,state,customerId,email,tableId,slotId,partySize,actorId,reason,commandId?}` |
| `booking.cancellation-rejected.v1` | Operations → Booking lifecycle queue | `data:{commandId,customerId,reason}` |

Envelope bắt buộc có `eventId UUID`, `eventType`, `schemaVersion=1`, `aggregateId`, `occurredAt`, `producer`, `correlationId`. `aggregateVersion` **bắt buộc** cho state-changed. JSON Schema trong `contracts/events/` là chuẩn cuối, không sửa field khác nhau ở 2 codebases.

**ACK rule:** thao tác `INSERT inbox(eventId)` + `UPSERT projection` + `UPDATE cancellation_commands` cùng tx; ACK sau commit. Duplicate `eventId` → không làm lần 2; khi nhận version thấp: có thể cập nhật command status phù hợp nếu commandId chưa xử lý nhưng **không lùi projection state**.

## F. Cấu trúc mã cụ thể

```text
services/booking/
├── main.ts
├── booking.module.ts
├── controllers/{booking,cancellation}.controller.ts
├── dto/{create-booking,cancel,booking-query}.dto.ts
├── application/{booking,cancellation,projection}.service.ts
├── infrastructure/{request,projection,cancellation,outbox,inbox}.repository.ts
├── messaging/{state-changed.consumer,cancellation-rejected.consumer,outbox-relay}.ts
└── migrations/001_init_booking.sql
```

**Source V1 lệch target V2:** `booking_requests.email` → `contact_email`; `booking_projection.version` → `aggregate_version`, `state` có thể null khi processing; `outbox_events` target yêu cầu `aggregate_id` nhưng V1 helper chưa insert; `inbox_events` target yêu cầu `aggregate_id`. V1 validation max party 6, contract max 12; chuẩn hóa thành 1–12. Không chạy target SQL V2 trước khi cập nhật query/helper.

## G. Các test bắt buộc

1. POST không có Idempotency-Key → 400; cùng key/payload lặp 3 lần → **một row + một event**.
2. Cùng key khác payload → 409, không thêm booking.
3. Broker down khi POST: HTTP vẫn 202 nếu DB còn sống, outbox `published_at=NULL`; broker lên relay phát tiếp.
4. Operations chưa chạy: Booking vẫn nhận yêu cầu; FE thấy QUEUED; khi Ops lên state REQUESTED xuất hiện.
5. Operations trả state version 3 trước 2: projection giữ 3, không lùi CONFIRMED → REQUESTED.
6. Gửi lại state eventId: `inbox` chặn duplicate; không gửi cancel result hai lần.
7. Khách B GET/hủy booking của khách A → 404/403 theo policy, không lộ email.
8. Cancel khi CONFIRMED đúng deadline: POST 202, command PENDING → state CANCELLED + command ACCEPTED.
9. Cancel khi SEATED: POST 202, command REJECTED + reason, projection vẫn SEATED; FE không hiển thị hủy thành công.
10. Chạy request create/cancel sát nhau: Operations có pending cancellation durable để giải quyết thứ tự.

## H. Kế hoạch theo tuần và bàn giao

- **Tuần 1:** dựa JWT verifier người 1; DTO + migration + outbox; chốt event schema với người 2.
- **Tuần 2:** POST + 2 GET; Requested event xuyên RabbitMQ; projection update và read pending.
- **Tuần 3:** Cancel command flow, rejected handling, idempotency HTTP, tests quyền.
- **Tuần 4:** Sửa response V2 envelope/errors và tham số query; hỗ trợ FE người 5.
- **Tuần 5:** Retry/outbox recovery/duplicate/out-of-order và broker outage.
- **Tuần 6:** E2E + Postman/Swagger + video chứng minh Booking hoạt động khi Notification down.

**Bàn giao:** 5 API đúng OpenAPI, SQL migration, 2 producer/2 consumer events, outbox/inbox, unit/integration tests, README chạy độc lập và fixtures cho Người 2/3.
