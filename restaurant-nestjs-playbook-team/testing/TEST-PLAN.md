# TEST PLAN — UNIT → CONTRACT → INTEGRATION → E2E → FAULT INJECTION

**Mục tiêu:** 5 người code riêng nhưng vẫn chạy ổn trên một Compose. Không được thay toàn bộ integration tests bằng test `health` hoặc chỉ xem một email Mailpit. Dùng DB và RabbitMQ riêng cho integration tests; chạy migration target V2 trên DB mới. Mock chỉ kiểm thử FE/contract, không thay được broker/SQL thật.

## A. Mức test và người chịu trách nhiệm

| Level | Phạm vi | Owner | Tiêu chí |
|---|---|---|---|
| Unit | Domain policy/DTO/normalization | Owner service | Không cần DB/AMQP, lặp lại ổn định |
| Repository integration | PostgreSQL riêng cho từng service | Owner service | Constraint, rollback, migration, transaction đúng |
| Messaging contract | JSON Schema của 4 events | Người 2+3+4 | Producer sample validate, consumer xử lý được |
| Service integration | RabbitMQ + 1 DB + service | Owner service | Outbox/inbox/retry/ACK, không phải mock handler |
| Cross-service integration | Booking + Operations + Tracking + Notification | 2+3+4 | Trạng thái/versions nhất quán cuối cùng, eventual consistency rõ |
| Gateway E2E | FE→Gateway→5 services | 1+5 | JWT/role, cookie, routes, body, response codes |
| Failure injection | kill Notification/RabbitMQ, duplicate/out-of-order, race | 1 coordinator, 2/3/4 chạy | Recovery không mất dữ liệu/không sai trạng thái |

## B. 30 ca nghiệm thu ưu tiên (ID dùng trong PR)

| ID | Owner | Kịch bản | Kỳ vọng |
|---|---|---|---|
| AUTH-01 | 1 | Register CUSTOMER hợp lệ | 201, password hash DB, không có passwordHash response |
| AUTH-02 | 1 | Register email trùng khác chữ hoa/thường | 409 |
| AUTH-03 | 1 | Đăng ký body role MANAGER | Không thể tự nâng quyền |
| AUTH-04 | 1 | Login sai/disabled | 401 |
| AUTH-05 | 1 | JWT sai chữ ký/audience/hết hạn | 401 tại mọi protected service |
| AUTH-06 | 1 | Refresh rotation + logout | Reuse token cũ 401; logout revoke session |
| AUTH-07 | 1 | STAFF tự tạo STAFF/đổi role | 403; profile không mass-assign |
| BK-01 | 4 | POST booking hợp lệ | 202 QUEUED + một request/outbox |
| BK-02 | 4 | Same Idempotency-Key + same body retry | Một booking; receipt như cũ |
| BK-03 | 4 | Same key + different body | 409 |
| BK-04 | 4 | Khách A GET/hủy booking B | Denied, không lộ dữ liệu |
| BK-05 | 4 | RabbitMQ down khi create | DB commit, outbox pending; recover publish |
| BK-06 | 4+2 | Cancel hợp lệ | 202 PENDING → CANCELLED, ACCEPTED |
| BK-07 | 4+2 | Cancel sau SEATED | 202 PENDING → REJECTED, state vẫn SEATED |
| BK-08 | 4+2 | Cancel event đến trước booking requested | Pending command được xử lý, không mất event |
| OPS-01 | 2 | Event requested valid/duplicated | 1 row REQUESTED v1, 1 state event |
| OPS-02 | 2 | Confirm capacity không đủ | 409, no allocation |
| OPS-03 | 2 | Hai staff cùng confirm cùng bàn/slot | 1 success, 1 409, 1 active allocation |
| OPS-04 | 2 | expectedVersion cũ | 409; không tăng version |
| OPS-05 | 2 | REQUESTED → COMPLETED trực tiếp | 409 |
| OPS-06 | 2 | Reject thiếu reason | 400 |
| OPS-07 | 2 | CHECKED_IN ngoài time window | 409 hoặc lỗi domain đã chốt; DB không đổi |
| OPS-08 | 2 | NO_SHOW quá sớm | 409, DB không đổi |
| OPS-09 | 2 | COMPLETE sau SEATED | COMPLETED, slot lịch sử không bị cấp lại vô tình |
| TR-01 | 3 | Duplicate state eventId | Một history row |
| TR-02 | 3 | Version 3 nhận trước version 2 | Projection giữ 3, history chứa 2 và 3 |
| NT-01 | 3 | Notification offline | Broker queue backlog; Booking/Operations/Tracking không lỗi |
| NT-02 | 3 | Notification hồi phục | Job được lưu một lần, backlog giảm |
| NT-03 | 3 | SMTP lỗi tạm thời | Job RETRY, delivery attempts tăng; không rollback reservation |
| FULL-01 | 1+2+3+4+5 | Từ React: login → book → confirm → check-in → seat → complete | Đúng role, 5 state events, timeline và notifications, không trùng allocation |

## C. API contract test matrix theo endpoint

Mỗi owner mở `shared/03-API-41-CHI-TIET.md`: tạo test với 200/201/202 đúng, 400 invalid DTO, 401, 403, 404/409 theo logic. Không yêu cầu 400/409 từ một GET không có conflict nếu hợp đồng không nêu; tập trung vào các tình huống thực tế của endpoint đó.

## D. Script demo cuối kỳ (chạy thủ công hoặc tự động hóa)

1. Start fresh `docker compose up -d --build`, seed `rest-001`, tables T01/T02/T03/T04, lunch/dinner; kiểm tra 5 service, gateway, postgres, broker, mailpit healthy.
2. Login CUSTOMER, STAFF, MANAGER qua `/api/auth/login`, lưu token tương ứng.
3. CUSTOMER đặt bàn 4 người dinner tương lai với Idempotency-Key; nhận 202/QUEUED. Đợi Booking GET chuyển REQUESTED.
4. STAFF xác nhận T02 version=1; nhận CONFIRMED version=2. CUSTOMER xem booking, Tracking timeline version1/2, Notification mine.
5. CUSTOMER hủy một booking khác khi CONFIRMED; command ACCEPTED và timeline CANCELLED. Thử hủy booking đã SEATED; command REJECTED.
6. Gửi hai confirm vào cùng table-slot bằng hai STAFF sessions; kiểm tra 1 thành công, 1 conflict.
7. **Dừng Notification:** `docker compose stop notification`; tạo/xác nhận 2 booking mới; Tracking và Booking vẫn cập nhật. Dùng RabbitMQ management chứng minh queue notification backlog tăng.
8. `docker compose start notification`; queue giảm về 0 (sau khi xử lý), job được lưu, mail vào Mailpit theo policy. Replay eventId duplicate kiểm tra không trùng.
9. Tắt RabbitMQ (không `down -v`), tạo booking; outbox pending; bật lại broker và chứng minh relay publish.
10. Xuất ảnh/screenshot: state diagram, sequence, inbox/outbox rows, queue, DB constraints, compose containers, FE flows, CI test results.

## E. Kịch bản retry/DLQ cần quan sát

- Nếu payload invalid không parse được, consumer không được ACK sớm; message được retry hữu hạn và đưa DLQ. Tránh requeue tight loop.
- Replaying một event đã commit nhưng chưa ACK phải không gây side effect lần hai.
- Notification SMTP lỗi không làm RabbitMQ event đi vòng mãi nếu job đã persist.

## F. Điều kiện khóa merge/release

Mỗi PR có test phù hợp với service scope + contract fixtures và build. Kỳ cuối chỉ release khi chạy lại được demo từ database clean (có seed) **không sửa code tay giữa các bước**. Dùng ngày/slot tương lai động trong test; không hardcode ngày cố định sẽ hết hạn.
