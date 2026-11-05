# 07 — INTERFACE HANDOFF CHECKLIST: 5 NGƯỜI GHÉP SERVICE KHÔNG LỆCH NHAU

Tài liệu này không thay thế OpenAPI và JSON Schema: dùng nó làm **biên bản bàn giao**. Khi một bên ghi nhận “done” thì bên nhận phải có test chứng minh dữ liệu đã đọc được từ contract thật (không chỉ mock).

## Handoff 1: Người 1 → Người 2, 3, 4, 5 (Auth/JWT/Gateway)

**Người 1 bàn giao:** key public dev (không private), sample JWT signed thật, `iss=restaurant-auth`, `aud=restaurant-api`, `alg=RS256`, claim `sub` UUID/`role`/`email`, mapping `req.user.id=sub`, cách verify và lỗi token. Gateway route table + Postman base URL.

**Người 2/3/4 test:** gọi ít nhất 1 GET protected với token CUSTOMER/STAFF/MANAGER, token expired, token wrong audience; không cần gọi Auth HTTP khi request đang được xử lý.

**Người 5 test:** login/refresh cookie, `/api` proxy và role menu; logout sạch; client không truy cập private key/refresh token.

## Handoff 2: Người 4 → Người 2 (Booking requested/cancel)

| Field | `booking.requested.v1` | `booking.cancel-requested.v1` |
|---|---|---|
| `eventId` | UUID mới, không đổi khi retry | UUID mới, không đổi khi retry |
| `aggregateId` | bookingId UUID | bookingId UUID |
| `data.customerId` | JWT `sub` | JWT `sub` |
| `data.email` | email snapshot | Không bắt buộc |
| `data.slotId` | YYYY-MM-DD-lunch/dinner | Không bắt buộc |
| `data.partySize` | 1–12 | Không bắt buộc |
| `data.commandId` | Không cần | UUID command |

**Người 2 nhận xong:** Operations consumer dedup, tạo REQUESTED v1 và phát state-changed; cancel before request đưa vào pending. **Người 4 kiểm tra ngược:** `booking_projection` nhận version 1 và command status phản ánh ACCEPTED/REJECTED sau này.

## Handoff 3: Người 2 → Người 3 và 4 (State & cancellation result)

**Operations phát:**

- `booking.state-changed.v1`: `aggregateId=bookingId`, `aggregateVersion>=1`, `data.previousState`, `state`, `customerId`, `email`, `slotId`, `partySize`, `tableId?`, `actorId`, `reason?`, `commandId?`.
- `booking.cancellation-rejected.v1`: commandId, customerId, reason; không phát state-changed giả.

**Booking nhận:** cập nhật projection nếu version cao hơn; update cancellation_commands theo `commandId`; không dùng receivedAt sắp state.

**Tracking nhận:** history mỗi version một dòng, projection luôn latest; cho version 3 rồi 2 không lùi state.

**Notification nhận:** lưu job + inbox trong DB rồi ACK; SMTP ngoài transaction. Khi N tắt, queue riêng có backlog.

**Điều kiện đóng handoff:** producer fixture validate JSON Schema trong `contracts/events`; consumer có test cùng fixture; E2E qua broker thật chạy được ít nhất REQUESTED → CONFIRMED.

## Handoff 4: Người 2/3/4/1 → Người 5 (HTTP API real)

- BE owner tự viết đúng response wrapper/camelCase theo OpenAPI; FE dùng generated types, không viết mapping snake_case cố định khi V2 đã chuẩn.
- Người 1 cung cấp base path `/api` qua Gateway, cookie/auth/response error; FE không hardcode tên container/port.
- Người 4 cung cấp POST 202, GET mine/detail, cancellation command pending/accepted/rejected.
- Người 2 cung cấp public availability/slots và STAFF transitions với expectedVersion, 409.
- Người 3 cung cấp timeline/status, Notification mine/unread/prefs; người 5 phải test dữ liệu chậm do eventual consistency.

## Handoff 5: Tích hợp CI/Compose (Người 1 lead)

Mỗi owner phải gửi một đoạn README của service mình: `DATABASE_URL`, `RABBITMQ_URL` (nếu dùng), `JWT_PUBLIC_KEY_PATH`, `SERVICE`, `PORT`, dependencies, migration command, health path, test command, event queues. Người 1 không tự đoán env.

## Mẫu checklist PR hàng ngày

```markdown
- Owner: Người ? / Service ?
- Contract thay đổi? Nếu có: OpenAPI/event JSON Schema + reviewers
- Migration: tên và cách chạy; backup/compatibility
- Code: controller/service/repository/consumer/outbox
- HTTP tests: success + validation + auth/ownership + conflict
- Messaging tests: duplicate + retry + ACK after commit
- E2E đã chạy qua Gateway/RabbitMQ? Logs hoặc test name
- FE impact: trang nào, error code nào, mock adapter cần sửa không
- Secrets: không có secret key/password/log PII
```

## Trình tự “đúng người đúng việc” khi có bug

- 401 ở mọi service: Người 1 kiểm tra issuer/key/clock/token mapping; nếu chỉ một service lỗi, owner service đó kiểm tra guard của mình.
- POST Booking 202 nhưng Ops không có record: Người 4 kiểm tra outbox, exchange routing/broker; Người 2 kiểm tra queue/inbox/DLQ.
- Ops đã CONFIRMED nhưng FE vẫn REQUESTED: Người 2 kiểm tra outbox publish; Người 4 projection; Người 5 polling/response adapter.
- Tracking không có version 2: Người 3 queue/history/inbox; Người 2 event payload/schema.
- Email không tới nhưng state đúng: Người 3 job worker/Mailpit/prefs; không rollback Booking/Operations.
- Dữ liệu bàn trùng: Người 2 chịu trách nhiệm DB transaction/index và code confirm (không đẩy cho FE/Booking).
- FE 404 do Gateway chưa route `/api/slots`: Người 1 sửa route, Người 5 review path.

## Mốc tích hợp chấp nhận được

- **M1:** request JWT của Người 1, Người 4 POST 202, Người 2 nhận REQUESTED, Người 3 Tracking GET được version1.
- **M2:** Người 2 CONFIRMED v2, Người 4 projection v2, Người 3 timeline version2 + notification job, FE Người 5 nhìn thấy.
- **M3:** cancel Accepted/Rejected, duplicate/ordering/race test, FE stale 409.
- **M4:** stop/start Notification + RabbitMQ downtime, Compose clean deploy/VPS, 30 test cases.
