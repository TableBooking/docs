# Stateful Mock API — NestJS V2 (không cần npm install)

## Chạy

```bash
cd restaurant-platform/mock-api
node server.mjs
```

Mặc định: `http://127.0.0.1:4010`. Yêu cầu Node.js 22+. Có thể dùng `PORT=4011 node server.mjs` trên Linux/macOS, hoặc `$env:PORT=4011; node server.mjs` trên PowerShell.

Mock dùng **in-memory state** với các API trong `../contracts/openapi/restaurant-api-v2.yaml`, mô phỏng auth/đặt bàn/duyệt/hủy/timeline/thông báo. Không có dependencies. Dữ liệu reset sau khi restart; dev-only `POST /__mock/reset` hoặc `GET /__mock/state`.

## Tài khoản demo — CHỈ MOCK

| Email | Password | Role |
|---|---|---|
| `guest@example.test` | `Demo123!` | CUSTOMER |
| `staff@example.test` | `Demo123!` | STAFF |
| `manager@example.test` | `Demo123!` | MANAGER |

Mock access token có dạng `mock-UUID`, **không phải JWT thật**. Mock đặt `refresh` cookie HttpOnly để FE có thể gọi refresh, nhưng không có mật mã thực sự. Tuyệt đối không deploy public hoặc dùng làm authentication production.

## Cách gọi

```bash
curl -X POST http://localhost:4010/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"guest@example.test","password":"Demo123!"}'
```

Sau khi nhận `accessToken`, dùng `Authorization: Bearer <token>` khi gọi API. `POST /api/bookings` cần `Idempotency-Key` dài ít nhất 8 ký tự. Khi tạo thành công trả 202/QUEUED, sau khoảng 200ms mock chuyển REQUESTED. Hủy trả 202/PENDING rồi mock xử lý trong 200ms. Phần này chỉ nhằm giúp FE thao tác.

Test tự động:

```bash
node --test test.mjs
```

### Kết nối React Vite với mock

Trong `restaurant-web/vite.config.ts`, thay proxy `/api` trỏ đến `http://127.0.0.1:4010` khi phát triển với mock. Ví dụ `VITE_API_TARGET=http://127.0.0.1:4010 npm run dev` sau khi áp dụng bản Vite config mới trong gói V2. **Không** gắn mock và NestJS Gateway lên cùng port.

## Giới hạn

- Không sử dụng RabbitMQ/PostgreSQL, không có outbox/inbox, message loss, retry/DLQ hay email thật. Chứng minh Notification outage phải chạy trên 5 service NestJS và RabbitMQ thật.
- Không đảm bảo chạy mô phỏng đầy đủ toàn bộ time guard/check-in/cancel cutoff và an toàn concurrent thực tế.
- Một số response đã chuẩn hóa camelCase `{data,meta}` theo **contract V2**, không trùng các response raw array/snake_case trong starter V1; cần sửa backend hoặc adapter khi thay mock bằng backend.
- Mock hoạt động cho nhóm frontend với seed và hành vi dự đoán được, không được xem là backend hoàn chỉnh.
