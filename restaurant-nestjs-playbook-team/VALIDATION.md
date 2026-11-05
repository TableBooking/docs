# Verification log (05/11/2026)

## Đã kiểm tra trong môi trường tạo tài liệu

- `contracts/openapi/restaurant-api-v2.yaml` parse YAML thành công: **41 OpenAPI operations**; stage flags: **19 existing**, **21 planned**, **1 adapt** (theo baseline source V1, không phải kết quả chạy BE thật).
- 5 JSON Schema event và envelope parse + validate draft 2020-12 thành công; sample `booking.state-changed.v1` validate với schema tương ứng.
- Stateful Mock API Node.js `node --test mock-api/test.mjs`: **1 test suite pass**, có login roles, idempotency, booking→confirm, table conflict, cancellation, timeline, notification, staff RBAC.
- 6 file SQL schema/seed đã được copy từ bản V2 do nhóm thống nhất; kiểm tra tồn tại, **chưa chạy thực tế trên PostgreSQL trong lượt tạo tài liệu này**.
- Các tệp .md và hợp đồng được đóng gói, kiểm tra ZIP CRC trước bàn giao.

## Chưa xác minh và không được coi là đã xong

- Chưa chạy build/typecheck source NestJS V1→V2 sau khi sửa các trường dữ liệu hoặc viết các API planned.
- Chưa chạy 5 service + PostgreSQL + RabbitMQ + Gateway bằng Docker Compose trong lượt này.
- Chưa chạy toàn bộ 41 endpoint với backend thật, chưa chạy race/notification outage trên broker thật.
- Chưa tạo code migration upgrade V1→V2 hay overlay production hoàn chỉnh; các file SQL được bàn giao là **target schema**, không phải migration từ DB đã có dữ liệu.

**Hướng hành động:** Các thành viên dùng tài liệu này để code đúng V2, chạy test contract + integration tại môi trường nhóm; chỉ khi test qua Gateway/RabbitMQ thật mới đánh dấu feature DONE.
