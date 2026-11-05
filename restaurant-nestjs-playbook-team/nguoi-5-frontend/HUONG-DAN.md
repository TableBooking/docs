# NGƯỜI 5 — FRONTEND REACT + TYPESCRIPT (REPO RIÊNG)

**Owner:** Người 5. **Repo:** `restaurant-web`, tách khỏi `restaurant-platform`; dùng React/Vite, TypeScript. **Không truy cập DB, RabbitMQ hoặc service internal port**. HTTP duy nhất đến Gateway `/api`; dùng mock Node.js 4010 trong thời gian backend chưa xong.

## A. Danh sách chức năng theo vai trò (đủ scope đồ án)

### CUSTOMER

- Đăng ký, đăng nhập, đăng xuất, refresh session, xem/sửa profile, đổi mật khẩu.
- Trang chủ: thông tin nhà hàng, khu vực, ngày, lunch/dinner, số khách, bàn còn khả dụng dạng tham khảo.
- Form đặt bàn: ngày/ca, partySize (1–12), ghi chú, contactPhone, hiển thị điều kiện hủy; generate `Idempotency-Key` **mỗi lần bấm tạo mới**, giữ cùng key nếu retry network cùng payload.
- Sau POST 202: hiển thị `Đã nhận yêu cầu — đang xử lý`, **không** hiển thị `Đã xác nhận bàn`. Poll `GET /api/bookings/{id}` 2–3 giây (backoff nếu lâu) đến khi `REQUESTED/CONFIRMED/REJECTED`.
- Danh sách “Đặt bàn của tôi”, chi tiết booking, timeline; yêu cầu hủy hiển thị pending bằng `commandId`, poll command status. Không hiển thị CANCELLED khi command vẫn PENDING.
- Danh sách thông báo, unread count, mark read/read all, preferences email/in-app.

### STAFF

- Xem danh sách booking theo ngày/ca/state, tìm booking, xem chi tiết, timeline.
- Duyệt và chọn table phù hợp theo capacity/slot, từ chối kèm lý do.
- Check-in, seat, complete, no-show với UI chỉ hiện action hợp lệ. Vẫn xử lý HTTP 409 vì UI có thể cũ và hai nhân viên thao tác cùng lúc.
- Hiện `expectedVersion` từ GET reservation; gửi trong body transition. 409 → refetch và hiển thị thông báo cụ thể, không cố ghi đè.

### MANAGER

- Toàn bộ màn STAFF; CRUD bàn/khu vực/ca; quản lý nhân viên (tạo, list, khóa/mở), dashboard thống kê cơ bản.
- Không tự động tạo luồng nhiều chi nhánh, thanh toán, ghép bàn trong MVP.

## B. Sitemap và routes FE

```text
/
/login
/register
/account
/bookings/new                  CUSTOMER
/bookings                     CUSTOMER
/bookings/:id                 CUSTOMER/STAFF/MANAGER (ownership theo BE)
/notifications                authenticated
/notifications/preferences    authenticated
/staff/reservations           STAFF|MANAGER
/staff/reservations/:id       STAFF|MANAGER
/manager/tables               MANAGER
/manager/areas                MANAGER
/manager/slots                MANAGER
/manager/staff                MANAGER
/manager/statistics           MANAGER
```

Client route guards là để UX; mọi quyền truy cập thật phải được NestJS service kiểm tra bằng JWT/ownership. Đừng tin role trong localStorage mà coi đó là bảo mật.

## C. Cấu trúc thư mục tránh conflict FE

```text
restaurant-web/
├── src/app/router.tsx
├── src/app/providers.tsx
├── src/api/http-client.ts          # baseURL /api, bearer, 401 handling
├── src/api/generated/              # sinh từ OpenAPI; KHÔNG sửa bằng tay
├── src/features/auth/{pages,api,components}/
├── src/features/booking/{pages,api,components}/
├── src/features/operations/{pages,api,components}/
├── src/features/tracking/{pages,api,components}/
├── src/features/notifications/{pages,api,components}/
├── src/features/management/{pages,api,components}/
├── src/components/{layout,ui,form}/
└── src/styles/
```

FE là một người nên không xung đột code nội bộ, nhưng **không sửa API backend** khi thấy body thiếu field: tạo issue cho đúng owner, hai bên sửa contract bằng PR. Người 1 review `/api` base path; người 2 review STAFF pages; người 3 review timeline/notifications; người 4 review booking pages.

## D. API client — quy tắc tích hợp

- Dev mock: `Vite proxy /api → http://localhost:4010` hoặc dùng `.env.mock.example` đã có. Dev thật: proxy `/api → http://localhost:8080`. Production: same origin `/api` và `/` qua Nginx/HTTPS.
- Dùng OpenAPI `contracts/openapi/restaurant-api-v2.yaml` làm nguồn để generate type (`openapi-typescript` hoặc client tool tương tự). Mỗi response chuẩn kiểm tra `data/meta` theo schema thực tế; starter V1 có raw array/snake_case nên sửa BE hoặc adapter tạm, không làm FE phụ thuộc vào sự không nhất quán.
- Access token lưu memory state càng tốt; refresh HttpOnly cookie cùng origin; API `credentials:'include'` khi refresh/logout, không đọc cookie bằng JS. 401 một request: refresh tối đa một lượt rồi retry đúng request; không tạo refresh loop, khi refresh fail về login.
- `Idempotency-Key`: `crypto.randomUUID()` khi người dùng bắt đầu submit một request mới; giữ key+payload giống nhau khi retry nếu timeout; không tạo key mới mỗi retry tự động, tránh đặt 2 booking.
- State changes có eventual consistency: polling 2–3 giây hoặc nút refresh; UI phải hiển thị PENDING, timeout và lỗi kết nối trung thực.
- Dùng UTC/ISO timestamp từ API, render theo Asia/Ho_Chi_Minh; không tự lấy `new Date('2026-...')` thiếu offset để xác định giờ ca.

## E. FE–BE giao diện dữ liệu theo feature

| Trang / feature | API tiêu thụ | Trạng thái UX |
|---|---|---|
| Auth login/register | Auth register/login/refresh/logout/me | loading, wrong credentials 401, session expired |
| Home/booking form | GET restaurant/current, areas, slots, availability; POST bookings | empty slots, no available tables, submitting, 202 queued |
| My bookings | GET bookings/mine, GET bookings/{id} | QUEUED, REQUESTED, CONFIRMED, REJECTED, CANCELLED... |
| Cancel flow | POST cancellations, GET commands/{commandId} | PENDING → ACCEPTED/REJECTED |
| Timeline | GET tracking/bookings/{id}/timeline + /status | no history yet, history ordered by version |
| Staff board | GET operations/reservations, GET detail | filter, loading, role denied, stale 409 |
| Staff actions | POST operations/reservations/{id}/{action} | confirm needs tableId, reject needs reason, all need expectedVersion |
| Manager resources | GET/POST/PATCH operations tables, areas, slot-configs | validate field/capacity, conflict |
| Manager staff | GET/POST users/staff, PATCH users/{id}/status | only MANAGER, protect last manager |
| Statistics | GET operations/stats/summary | empty date, chart/table |
| Notifications | GET mine/unread-count/prefs, POST read/read-all, PATCH prefs | badge count, empty, delayed events |

## F. Ví dụ FE gọi Booking

```ts
export async function createBooking(input: {slotId:string;partySize:number;note?:string},
  token:string, idempotencyKey:string) {
  const response = await fetch('/api/bookings', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,
      'Idempotency-Key':idempotencyKey},
    credentials:'include', body:JSON.stringify(input)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  return body; // OpenAPI BookingReceipt: bookingId, processingStatus, ...
}
```

Không lấy `customerId` từ form. Khi Operations trả HTTP 409 (stale version/table conflict), UI cần GET lại reservation/availability, hiển thị “Bàn đã được nhân viên khác xử lý”, không retry confirm tự động.

## G. Cách phát triển không chờ backend

1. **Tuần 1:** chạy mock: `cd restaurant-platform/mock-api && node server.mjs`, `node test.mjs`; FE `npm install && npm run dev`; cài proxy localhost:4010; tạo layout/router/auth context.
2. **Tuần 2:** build CUSTOMER pages với mock; đăng nhập ba role demo; form mới/mine/cancel/timeline.
3. **Tuần 3:** STAFF board + transition form; mock có stateful reservation; test double click/409/không có bàn.
4. **Tuần 4:** MANAGER tables/areas/slots/staff/stats; notification center; form errors/loading/empty.
5. **Tuần 5:** chuyển baseURL sang Gateway thật, chạy các ca E2E; thay adapter V1 theo OpenAPI V2, chốt FE với 4 chủ service.
6. **Tuần 6:** responsive, error boundary, test build production, demo script, screenshots và video.

## H. Test của FE

- Login đúng role → đúng menu, role CUSTOMER nhập URL `/manager/*` bị điều hướng, backend vẫn 403 khi gọi thẳng.
- Form gửi hai lần vì double click → cùng idempotency key hoặc disable submit, chỉ một booking.
- Nhận `202 QUEUED` không đánh nhầm thành CONFIRMED; poll đến khi REQUESTED/CONFIRMED.
- Hủy SEATED nhận command REJECTED vẫn giữ trạng thái SEATED và hiển thị reason.
- Hai nhân viên cùng chọn bàn: FE thứ hai nhận 409 và refetch.
- Notification Service tắt: Booking/Tracking pages vẫn hoạt động, notifications có thể chậm.
- Refresh expired: retry một lần rồi logout nếu thất bại, không loop; account input không rò password vào console.
- Build `npm run build` pass; dev proxy dùng đúng Gateway (`/api/...`).

**Bàn giao:** Repo `restaurant-web`, trang cho cả 3 vai trò, API client theo OpenAPI + mock support, docs env, FE tests, Docker image web và PR tích hợp người 1.
