# 06 — KẾ HOẠCH 6 TUẦN CHO ĐÚNG 5 NGƯỜI

| Tuần | Người 1: Auth + Gateway | Người 2: Operations | Người 3: Tracking+Notification | Người 4: Booking | Người 5: FE | Mốc tích hợp |
|---|---|---|---|---|---|---|
| **1** | Chốt JWT, routes, Compose, 5 DB roles, key dev | Schema/seed, state policy, event requested contract | Schema 2 DB, state event fixture, Tracking consumer skeleton | Schema Booking, request/cancel event fixture, outbox | Repo web, router/layout, mock, typed client | Broker/queue/5 containers/health, contracts frozen |
| **2** | Auth register/login/refresh/me + JWT verifier | Consume Requested → REQUESTED v1, GET restaurant/slots/availability | Tracking history + timeline + projection version | POST bookings 202, GET mine/detail, idempotency | Auth pages + form booking + pending status | **Golden path 1:** FE login → Booking POST → Operations REQUESTED → Tracking |
| **3** | Profile/change-password, MANAGER staff + RBAC | Confirm/reject/table allocation + time guards | Tracking status complete; Notification consume→job/inbox | Cancellation command flow + projection, rejected handling | Staff board, confirm/reject, cancel UI | **Golden path 2:** STAFF confirm/REJECT; Booking state v2 + timeline |
| **4** | Security + complete Auth API, Gateway routes mới | Checkin/seat/complete/no-show; areas/tables/slots/stats | Notification SMTP worker + 6 API + retry/prefs | Error envelope, idempotency/race tests | Manager panels + notifications/timeline | **Golden path 3:** full lifecycle và hủy, Mailpit |
| **5** | CI build/push SHA images, Compose staging | Concurrent confirm, cancel-before-request, time policy tests | Outage + duplicate/out-of-order/DLQ tests | Broker down/outbox recovery + ownership tests | E2E FE Gateway, 401/403/409/polling | **Fault tests:** Notification down/back, broker down/back, concurrency |
| **6** | VPS + HTTPS, demo, backup/restore, release | Stabilize API, event version + docs | Timeline/Notification reliability + screenshots | Integration regression + Postman | Polish FE + demo flow + screenshots/video | Full clean deploy/seed, test suite pass, báo cáo |

## Daily sync 10 phút (tránh conflict lớn)

1. Mỗi người báo: API/event đã hoàn thành, PR mở, blockers.
2. Người 1 cập nhật release manifest, người 5 cập nhật mock→real readiness; người 2/3/4 cảnh báo thay đổi contract.
3. Mỗi ngày ít nhất một PR nhỏ được merge hoặc review; không để tới tuần cuối mới tích hợp.
4. Mỗi tuần một buổi tích hợp 30–60 phút, chạy demo giai đoạn theo bảng trên. Người tạo lỗi sửa service mình, không đẩy cho integration lead.

## Checklist file bàn giao cuối mỗi tuần

- **Người 1:** JWT public key/test claims, Gateway route map, CI/Compose, Auth API test.
- **Người 2:** Operations schema/migration, REST + domain policies, state event fixture, race test.
- **Người 3:** Tracking history/version tests, Notification jobs/worker/queue tests, DLQ screenshots.
- **Người 4:** Booking API/request idempotency, producer/consumer contract fixtures, outbox/broker tests.
- **Người 5:** FE built routes & screenshots, mock API run, API client status, FE E2E test.

## Risk ưu tiên theo mức độ

1. **Cao:** Schema V1/V2 lệch — migrate ngay tuần 1, không để sprint cuối.
2. **Cao:** Confirm đụng bàn — DB unique + transaction phải test tuần 3.
3. **Cao:** Event payload thay tên giữa producer/consumer — schema tests và review trước merge.
4. **Cao:** Notification outage không có backlog vì queue chưa provision — test topology ngày đầu.
5. **Trung bình:** Người 1 ôm Gateway+Auth+CI và người 3 ôm 2 service — giảm UI/hạ tầng trang trí, ưu tiên nghiệp vụ trước; owner khác tự viết tests và Dockerfile module mình.
6. **Trung bình:** FE dùng raw response V1 — chốt adapter/mock OpenAPI V2, dọn adapter trước demo.

## Definition of Finished cả dự án

- **Code:** đủ 41 operations theo OpenAPI V2, 5 DB + migrations, 4 event contracts và FE theo vai trò.
- **Chức năng:** login → requested → confirmed → checked-in → seated → completed; reject/cancel/no-show hợp lệ, idempotency, rollback tại DB transaction khi bàn trùng.
- **Chịu lỗi:** Notification down không chặn luồng; broker down giữ outbox; duplicate/out-of-order không làm sai state; bounded retry+DLQ.
- **Vận hành:** demo bằng một Compose, HTTPS staging nếu public, volumes/backup, image tags, repo README.
- **Báo cáo:** ERD từng DB, State Diagram, Sequence Pub/Sub, test evidence và phân công công việc.
