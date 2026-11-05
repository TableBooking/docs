# 04 — RabbitMQ: exchange, queue, event contracts, outbox/inbox, retry

## Topology chính (khởi tạo trước khi demo)

- Exchange topic durable: `restaurant.events`; DLX: `restaurant.dlx`; retry exchange: `restaurant.retry` trong starter.
- Các producer **không** publish trực tiếp từ transaction nghiệp vụ: ghi `outbox_events`, relay publish với persistent messages + publisher confirms, xử lý mandatory return/unroutable, rồi đánh dấu published.
- Mỗi consumer có queue riêng và manual ACK sau DB commit. `notifications` queue có thể tích backlog khi service tắt.

| Queue chính | Routing keys bind | Consumer | DLQ theo queue |
|---|---|---|---|
| `operations.requests.q` | `booking.requested.v1`, `booking.cancel-requested.v1` | Operations (người 2) | `operations.requests.q.dlq` |
| `booking.lifecycle.q` | `booking.state-changed.v1`, `booking.cancellation-rejected.v1` | Booking (người 4) | `booking.lifecycle.q.dlq` |
| `tracking.lifecycle.q` | `booking.state-changed.v1` | Tracking (người 3) | `tracking.lifecycle.q.dlq` |
| `notification.lifecycle.q` | `booking.state-changed.v1` | Notification (người 3) | `notification.lifecycle.q.dlq` |

RabbitMQ với một queue chung Tracking/Notification sẽ làm hai consumer **cạnh tranh** messages — sai yêu cầu pub/sub. Queue riêng phải tồn tại trước khi producer publish; queue durable chỉ giữ được message nếu tồn tại tại thời điểm publish và message persistent. Dùng named Docker volumes cho broker; tắt container/restart không xóa volume.

## Envelope cố định V1

```json
{
  "eventId":"5f72539a-8e42-488d-94df-42bd1b1cb4f1",
  "eventType":"booking.state-changed.v1",
  "schemaVersion":1,
  "aggregateId":"6e74a0a8-213c-47f8-8cce-f72f24407d94",
  "aggregateVersion":2,
  "occurredAt":"2026-11-10T11:00:00Z",
  "producer":"operations-service",
  "correlationId":"d4e7e5a7-5baf-4cc8-b894-21568b37e10a",
  "data":{
    "previousState":"REQUESTED",
    "state":"CONFIRMED",
    "customerId":"f6c2ae37-417c-4c08-9fb9-a13fe5c6797f",
    "email":"guest@example.test",
    "tableId":"T02",
    "slotId":"2026-11-10-dinner",
    "partySize":4,
    "actorId":"staff-01",
    "reason":null
  }
}
```

**Cẩn thận:** JSON Schema V2 trong gói đặt tên `data.email`, **không phải** `notificationTarget.email`. DB V2 đặt `contact_email`, đây là mapping tầng persistence, không được đổi event payload mà không cập nhật contract. `eventId` dùng UUID mới cho mỗi domain event, `aggregateId` là bookingId, `aggregateVersion` tăng trong Operations; `schemaVersion` là version của event payload, không phải state version. Với `booking.requested`, `booking.cancel-requested` không bắt buộc `aggregateVersion`.

## Bốn loại event

1. **`booking.requested.v1`** — Booking producer; `data.customerId`, `data.email`, `data.slotId`, `data.partySize`, `data.note?`, `contactPhone?`. Operations validate và tạo REQUESTED v1.
2. **`booking.cancel-requested.v1`** — Booking producer; `data.commandId`, `customerId`, `reason?`. Operations đánh giá state + deadline, nếu chưa có reservation thì lưu `pending_cancellations`.
3. **`booking.state-changed.v1`** — Operations producer; chứa state, previousState, contact snapshot `email`, version, tableId, actor/reason, `commandId?`. Booking cập nhật projection/command, Tracking history, Notification job.
4. **`booking.cancellation-rejected.v1`** — Operations producer; `data.commandId`, `customerId`, `reason`. Booking update cancellation command REJECTED, không đổi state.

Không thêm sự kiện `user.login`, `notification.sent`, `tracking.updated` vào MVP nếu không có use case; không làm bộ message lớn không cần thiết.

## Transactional outbox chuẩn và cạm bẫy V1

Target schema Booking/Operations có `outbox_events(event_id, aggregate_id, routing_key, payload, attempts, created_at, published_at)`; V1 `enqueue` thiếu `aggregate_id`. Sửa helper hoặc repository riêng theo target:

```sql
INSERT INTO outbox_events(event_id, aggregate_id, routing_key, payload)
VALUES($1::uuid, $2::uuid, $3::text, $4::jsonb);
```

Relay tìm hàng `published_at IS NULL` theo thứ tự đã chốt, `SELECT ... FOR UPDATE SKIP LOCKED` để nhiều worker không lấy cùng row. Không publish và mark sent trước commit nghiệp vụ. Khi broker confirm rồi relay crash trước UPDATE, event được gửi lại; inbox bảo đảm at-least-once xử lý không lặp hiệu ứng.

**Lưu ý hiệu năng:** không giữ transaction quá lâu trong khi mạng RabbitMQ chậm; với đồ án tối giản có thể giữ lock đợt nhỏ, với production nên thiết kế claim/lease và xử lý sau publish để không giữ DB transaction qua network call. Chọn một mô hình rõ ràng trước khi triển khai production.

## Inbox/ACK đúng cách

- Trong cùng DB transaction: `INSERT inbox_events(event_id,... ) ON CONFLICT DO NOTHING`, nếu mới thì mutate local tables/projection/job, commit.
- Nếu trùng `eventId` thì return success; ACK để broker không lặp vô hạn.
- Nếu DB commit thất bại thì throw → `nack`, queue retry; ACK chỉ sau khi callback listener resolve.
- **Không** dùng `noAck:true` để tạo cảm giác consumer luôn thành công.
- `inbox_events` V2 có cấu trúc khác nhau giữa service: Operations/Booking cần `aggregate_id` và Booking có version; Tracking/Notification chỉ eventId. Không dùng một SQL helper `INSERT event_id` cho mọi DB như V1.

## Retry / DLQ / poison message

- Lỗi tạm (DB unavailable, SMTP transient) retry có backoff, giới hạn lượt; lỗi không sửa được schema/poison vào DLQ với correlation/eventId để debug.
- Starter V1 đã có retry queue TTL ~5 giây và .dlq; kiểm tra số lần retry, `x-death` header và việc republish to DLX **bằng test**, không chỉ đọc code.
- Khi replay từ DLQ phải giữ nguyên `eventId` để inbox dedup; đối với một event lỗi do schema, trước tiên sửa code/contract rồi replay.
- Khi Notification worker SMTP lỗi không phải tự động NACK event nếu đã lưu job thành công; mail retry nằm ở job worker DB, không đẩy đi đẩy lại state event.

## Rules version & đồng bộ

- Operations tăng `aggregateVersion` trong cùng transaction mỗi lần state transition; REQUESTED version=1.
- Booking/Tracking projection update với điều kiện **database** `WHERE current.aggregate_version < excluded.aggregate_version`.
- Tracking lưu mọi event hợp lệ và unique `(booking_id,aggregate_version)`; event version cũ có thể bổ sung history sau này nhưng không đẩy projection lùi.
- Không tin vào ordering do broker khi có retry/restart/multiple publishers; có cơ chế pending cancel theo bookingId.

## Ma trận test RabbitMQ trước khi chấm

- [ ] 4 queue + retry + DLQ tồn tại **trước** khi gửi event, cả khi Notification process chưa khởi động.
- [ ] Notification off: Booking/Operations/Tracking vẫn chạy; queue notification backlog tăng; on → backlog tiêu thụ.
- [ ] Hai event cùng eventId: mỗi consumer chỉ tạo một hiệu ứng.
- [ ] Broker off 1–2 phút: outbox vẫn pending, broker back → publish và marking sent.
- [ ] Event bad JSON → retry hữu hạn → DLQ; service không block message mãi mãi.
- [ ] State version 3 trước 2: Tracking history đủ 2,3, projection giữ version 3.
- [ ] Cancel đến trước Requested: operations không mất command; không thay state vô căn cứ.
