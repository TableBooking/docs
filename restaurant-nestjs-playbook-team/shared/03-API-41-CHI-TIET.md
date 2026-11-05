# 41 API — DANH MỤC VÀ CHECKLIST TRIỂN KHAI (OPENAPI V2)

> Nguồn hợp đồng cuối cùng: `contracts/openapi/restaurant-api-v2.yaml`; bảng này được sinh từ file YAML cùng ZIP. `existing` nghĩa là code mẫu, chưa chắc đã E2E. 41 operations gồm action route động một operation.

## Bảng 41 API theo người phụ trách

| # | Người | Service | Method | Gateway Path | Role | Stage | HTTP success |
|---:|---|---|---|---|---|---|---|
| 1 | Người 1 | Auth | `POST` | `/api/auth/register` | PUBLIC | `existing` | 201 |
| 2 | Người 1 | Auth | `POST` | `/api/auth/login` | PUBLIC | `existing` | 200 |
| 3 | Người 1 | Auth | `POST` | `/api/auth/refresh` | PUBLIC | `existing` | 200 |
| 4 | Người 1 | Auth | `POST` | `/api/auth/logout` | PUBLIC | `existing` | 200 |
| 5 | Người 1 | Auth | `POST` | `/api/auth/change-password` | CUSTOMER|STAFF|MANAGER | `planned` | 200 |
| 6 | Người 1 | Auth | `GET` | `/api/users/me` | CUSTOMER|STAFF|MANAGER | `existing` | 200 |
| 7 | Người 1 | Auth | `PATCH` | `/api/users/me` | CUSTOMER|STAFF|MANAGER | `planned` | 200 |
| 8 | Người 1 | Auth | `GET` | `/api/users/staff` | MANAGER | `planned` | 200 |
| 9 | Người 1 | Auth | `POST` | `/api/users/staff` | MANAGER | `existing` | 201 |
| 10 | Người 1 | Auth | `PATCH` | `/api/users/{id}/status` | MANAGER | `planned` | 200 |
| 11 | Người 2 | Operations | `GET` | `/api/restaurants/current` | PUBLIC | `planned` | 200 |
| 12 | Người 2 | Operations | `GET` | `/api/restaurants/current/areas` | PUBLIC | `planned` | 200 |
| 13 | Người 2 | Operations | `GET` | `/api/slots` | PUBLIC | `planned` | 200 |
| 14 | Người 2 | Operations | `GET` | `/api/availability` | PUBLIC | `planned` | 200 |
| 15 | Người 4 | Booking | `POST` | `/api/bookings` | CUSTOMER|STAFF|MANAGER | `existing` | 202 |
| 16 | Người 4 | Booking | `GET` | `/api/bookings/mine` | CUSTOMER|STAFF|MANAGER | `existing` | 200 |
| 17 | Người 4 | Booking | `GET` | `/api/bookings/{id}` | CUSTOMER|STAFF|MANAGER | `existing` | 200 |
| 18 | Người 4 | Booking | `POST` | `/api/bookings/{id}/cancellation-requests` | CUSTOMER|STAFF|MANAGER | `existing` | 202 |
| 19 | Người 4 | Booking | `GET` | `/api/bookings/commands/{commandId}` | CUSTOMER|STAFF|MANAGER | `existing` | 200 |
| 20 | Người 2 | Operations | `GET` | `/api/operations/reservations` | STAFF|MANAGER | `existing` | 200 |
| 21 | Người 2 | Operations | `GET` | `/api/operations/reservations/{id}` | STAFF|MANAGER | `planned` | 200 |
| 22 | Người 2 | Operations | `POST` | `/api/operations/reservations/{id}/{action}` | STAFF|MANAGER | `existing` | 200 |
| 23 | Người 2 | Operations | `GET` | `/api/operations/tables` | STAFF|MANAGER | `existing` | 200 |
| 24 | Người 2 | Operations | `POST` | `/api/operations/tables` | MANAGER | `existing` | 201 |
| 25 | Người 2 | Operations | `PATCH` | `/api/operations/tables/{id}` | MANAGER | `existing` | 200 |
| 26 | Người 2 | Operations | `GET` | `/api/operations/areas` | STAFF|MANAGER | `planned` | 200 |
| 27 | Người 2 | Operations | `POST` | `/api/operations/areas` | MANAGER | `planned` | 201 |
| 28 | Người 2 | Operations | `PATCH` | `/api/operations/areas/{id}` | MANAGER | `planned` | 200 |
| 29 | Người 2 | Operations | `GET` | `/api/operations/slot-configs` | STAFF|MANAGER | `planned` | 200 |
| 30 | Người 2 | Operations | `POST` | `/api/operations/slot-configs` | MANAGER | `planned` | 201 |
| 31 | Người 2 | Operations | `PATCH` | `/api/operations/slot-configs/{code}` | MANAGER | `planned` | 200 |
| 32 | Người 2 | Operations | `GET` | `/api/operations/stats/summary` | MANAGER | `planned` | 200 |
| 33 | Người 3 | Tracking | `GET` | `/api/tracking/bookings/{id}/timeline` | CUSTOMER|STAFF|MANAGER | `existing` | 200 |
| 34 | Người 3 | Tracking | `GET` | `/api/tracking/bookings/{id}/status` | CUSTOMER|STAFF|MANAGER | `planned` | 200 |
| 35 | Người 3 | Notification | `GET` | `/api/notifications/mine` | CUSTOMER|STAFF|MANAGER | `existing` | 200 |
| 36 | Người 3 | Notification | `GET` | `/api/notifications/unread-count` | CUSTOMER|STAFF|MANAGER | `planned` | 200 |
| 37 | Người 3 | Notification | `POST` | `/api/notifications/{id}/read` | CUSTOMER|STAFF|MANAGER | `adapt` | 200 |
| 38 | Người 3 | Notification | `POST` | `/api/notifications/read-all` | CUSTOMER|STAFF|MANAGER | `planned` | 200 |
| 39 | Người 3 | Notification | `GET` | `/api/notifications/preferences` | CUSTOMER|STAFF|MANAGER | `planned` | 200 |
| 40 | Người 3 | Notification | `PATCH` | `/api/notifications/preferences` | CUSTOMER|STAFF|MANAGER | `planned` | 200 |
| 41 | Người 1 | Gateway | `GET` | `/api/health` | PUBLIC | `existing` | 200 |

## Từng API: đầu vào, đầu ra, điểm kiểm tra

Các mô tả field bên dưới được sinh từ `components/schemas` của OpenAPI. Khi code, DTO phải có field validation đúng, không tự thêm field ngoài hợp đồng; mọi API protected phải kiểm tra JWT, role và ownership.

### 1. POST `/api/auth/register`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `existing`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Khách đăng ký tài khoản. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `RegisterInput` — `email` (string, bắt buộc), `password` (string, bắt buộc), `fullName` (string, bắt buộc), `phone` (string, tùy chọn)
- **Success:** 201: `User` — `id` (string, bắt buộc), `email` (string, bắt buộc), `fullName` (string, bắt buộc), `phone` (string, tùy chọn), `role` (string/CUSTOMER|STAFF|MANAGER, bắt buộc), `active` (boolean, bắt buộc), `createdAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 2. POST `/api/auth/login`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `existing`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Đăng nhập lấy access token và refresh cookie. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `LoginInput` — `email` (string, bắt buộc), `password` (string, bắt buộc)
- **Success:** 200: `AuthTokens` — `accessToken` (string, bắt buộc), `tokenType` (string, bắt buộc), `expiresIn` (integer, bắt buộc), `user` (ref:User, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 3. POST `/api/auth/refresh`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `existing`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Xoay vòng refresh session. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `AuthTokens` — `accessToken` (string, bắt buộc), `tokenType` (string, bắt buộc), `expiresIn` (integer, bắt buộc), `user` (ref:User, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 4. POST `/api/auth/logout`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `existing`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Thu hồi refresh session. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Ok` — `ok` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 5. POST `/api/auth/change-password`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `planned`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Đổi mật khẩu khi đã đăng nhập. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `PasswordChange` — `currentPassword` (string, bắt buộc), `newPassword` (string, bắt buộc)
- **Success:** 200: `Ok` — `ok` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 6. GET `/api/users/me`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Xem tài khoản hiện tại. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `User` — `id` (string, bắt buộc), `email` (string, bắt buộc), `fullName` (string, bắt buộc), `phone` (string, tùy chọn), `role` (string/CUSTOMER|STAFF|MANAGER, bắt buộc), `active` (boolean, bắt buộc), `createdAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 7. PATCH `/api/users/me`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `planned`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Cập nhật họ tên/số điện thoại. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `UserPatch` — `fullName` (string, tùy chọn), `phone` (string, tùy chọn)
- **Success:** 200: `User` — `id` (string, bắt buộc), `email` (string, bắt buộc), `fullName` (string, bắt buộc), `phone` (string, tùy chọn), `role` (string/CUSTOMER|STAFF|MANAGER, bắt buộc), `active` (boolean, bắt buộc), `createdAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 8. GET `/api/users/staff`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `planned`; **role:** `MANAGER`.
- **Nghiệp vụ:** Danh sách nhân viên. 
- **Path/query/header:** `query: page` (tùy chọn, integer); `query: limit` (tùy chọn, integer)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `UserList` — `data` (array, bắt buộc), `meta` (ref:PageMeta, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 9. POST `/api/users/staff`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `existing`; **role:** `MANAGER`.
- **Nghiệp vụ:** Quản lý tạo tài khoản lễ tân. 
- **Path/query/header:** `query: page` (tùy chọn, integer); `query: limit` (tùy chọn, integer)
- **Request JSON:** `StaffCreate` — `email` (string, bắt buộc), `password` (string, bắt buộc), `fullName` (string, bắt buộc)
- **Success:** 201: `User` — `id` (string, bắt buộc), `email` (string, bắt buộc), `fullName` (string, bắt buộc), `phone` (string, tùy chọn), `role` (string/CUSTOMER|STAFF|MANAGER, bắt buộc), `active` (boolean, bắt buộc), `createdAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 10. PATCH `/api/users/{id}/status`
- **Chủ trì:** Người 1 (Auth); **trạng thái starter:** `planned`; **role:** `MANAGER`.
- **Nghiệp vụ:** Khóa/mở tài khoản. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** `AccountStatusInput` — `active` (boolean, bắt buộc)
- **Success:** 200: `User` — `id` (string, bắt buộc), `email` (string, bắt buộc), `fullName` (string, bắt buộc), `phone` (string, tùy chọn), `role` (string/CUSTOMER|STAFF|MANAGER, bắt buộc), `active` (boolean, bắt buộc), `createdAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 11. GET `/api/restaurants/current`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Thông tin nhà hàng công khai. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Restaurant` — `id` (string, bắt buộc), `name` (string, bắt buộc), `timezone` (string, bắt buộc), `address` (string, tùy chọn), `phone` (string, tùy chọn), `cancelBeforeMinutes` (integer, tùy chọn), `noShowAfterMinutes` (integer, tùy chọn), `checkinEarlyMinutes` (integer, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 12. GET `/api/restaurants/current/areas`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Danh sách khu vực công khai. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `AreaArray` — xem `#/components/schemas/AreaArray`
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 13. GET `/api/slots`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Danh sách ca phục vụ theo ngày. 
- **Path/query/header:** `query: date` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `SlotArray` — xem `#/components/schemas/SlotArray`
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 14. GET `/api/availability`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Tra cứu bàn có khả năng đáp ứng (không giữ bàn). 
- **Path/query/header:** `query: date` (bắt buộc, string); `query: slotCode` (bắt buộc, string); `query: partySize` (bắt buộc, integer)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Availability` — `date` (string, bắt buộc), `slotCode` (string, bắt buộc), `partySize` (integer, bắt buộc), `available` (boolean, bắt buộc), `availableTableCount` (integer, bắt buộc), `note` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 15. POST `/api/bookings`
- **Chủ trì:** Người 4 (Booking); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Tạo yêu cầu đặt bàn bất đồng bộ, cần Idempotency-Key. 
- **Path/query/header:** `header: Idempotency-Key` (bắt buộc, string)
- **Request JSON:** `BookingInput` — `slotId` (string, bắt buộc), `partySize` (integer, bắt buộc), `note` (string, tùy chọn), `contactPhone` (string, tùy chọn)
- **Success:** 202: `BookingReceipt` — `bookingId` (string, bắt buộc), `processingStatus` (string/QUEUED, bắt buộc), `createdAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 16. GET `/api/bookings/mine`
- **Chủ trì:** Người 4 (Booking); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Liệt kê đặt bàn của tài khoản hiện tại. 
- **Path/query/header:** `query: state` (tùy chọn, string); `query: page` (tùy chọn, integer); `query: limit` (tùy chọn, integer)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `BookingList` — `data` (array, bắt buộc), `meta` (ref:PageMeta, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 17. GET `/api/bookings/{id}`
- **Chủ trì:** Người 4 (Booking); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Chi tiết đặt bàn, kiểm tra ownership. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Booking` — `bookingId` (string, bắt buộc), `customerId` (string, bắt buộc), `slotId` (string, bắt buộc), `partySize` (integer, bắt buộc), `note` (string, tùy chọn), `state` (string/REQUESTED|CONFIRMED|REJECTED|CANCELLED|CHECKED_IN|SEATED|COMPLETED|NO_SHOW, bắt buộc), `version` (integer, bắt buộc), `tableId` (string, tùy chọn), `createdAt` (string, tùy chọn), `updatedAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 18. POST `/api/bookings/{id}/cancellation-requests`
- **Chủ trì:** Người 4 (Booking); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Gửi yêu cầu hủy, chưa hủy ngay. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** `CancelInput` — `reason` (string, tùy chọn)
- **Success:** 202: `CancellationReceipt` — `commandId` (string, bắt buộc), `bookingId` (string, bắt buộc), `status` (string/PENDING, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 19. GET `/api/bookings/commands/{commandId}`
- **Chủ trì:** Người 4 (Booking); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Xem kết quả xử lý yêu cầu hủy. 
- **Path/query/header:** `path: commandId` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `CancellationCommand` — `commandId` (string, bắt buộc), `bookingId` (string, bắt buộc), `status` (string/PENDING|ACCEPTED|REJECTED, bắt buộc), `reason` (string, tùy chọn), `createdAt` (string, tùy chọn), `resolvedAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 20. GET `/api/operations/reservations`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `existing`; **role:** `STAFF|MANAGER`.
- **Nghiệp vụ:** Danh sách điều phối, lọc state/date/slotId. 
- **Path/query/header:** `query: date` (tùy chọn, string); `query: slotId` (tùy chọn, string); `query: state` (tùy chọn, string); `query: page` (tùy chọn, integer); `query: limit` (tùy chọn, integer)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `ReservationList` — `data` (array, bắt buộc), `meta` (ref:PageMeta, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 21. GET `/api/operations/reservations/{id}`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `STAFF|MANAGER`.
- **Nghiệp vụ:** Chi tiết đặt bàn cho nhân viên. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Reservation` — `bookingId` (string, bắt buộc), `customerId` (string, bắt buộc), `slotId` (string, bắt buộc), `partySize` (integer, bắt buộc), `state` (string/REQUESTED|CONFIRMED|REJECTED|CANCELLED|CHECKED_IN|SEATED|COMPLETED|NO_SHOW, bắt buộc), `version` (integer, bắt buộc), `tableId` (string, tùy chọn), `createdAt` (string, tùy chọn), `updatedAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 22. POST `/api/operations/reservations/{id}/{action}`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `existing`; **role:** `STAFF|MANAGER`.
- **Nghiệp vụ:** Chuyển trạng thái: confirm/reject/check-in/seat/complete/no-show/cancel. Phải kiểm tra expectedVersion; confirm bắt buộc tableId; reject/cancel cần reason; guards thời gian chưa có trong starter.
- **Path/query/header:** `path: id` (bắt buộc, string); `path: action` (bắt buộc, string)
- **Request JSON:** `TransitionInput` — `expectedVersion` (integer, bắt buộc), `tableId` (string, tùy chọn), `reason` (string, tùy chọn)
- **Success:** 200: `TransitionResult` — `bookingId` (string, bắt buộc), `state` (string/REQUESTED|CONFIRMED|REJECTED|CANCELLED|CHECKED_IN|SEATED|COMPLETED|NO_SHOW, bắt buộc), `version` (integer, bắt buộc), `tableId` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 23. GET `/api/operations/tables`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `existing`; **role:** `STAFF|MANAGER`.
- **Nghiệp vụ:** Danh sách bàn có trạng thái hoạt động. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `TableArray` — xem `#/components/schemas/TableArray`
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 24. POST `/api/operations/tables`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `existing`; **role:** `MANAGER`.
- **Nghiệp vụ:** Tạo bàn. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `TableInput` — `id` (string, bắt buộc), `areaId` (string, bắt buộc), `name` (string, tùy chọn), `capacity` (integer, bắt buộc)
- **Success:** 201: `Table` — `id` (string, bắt buộc), `areaId` (string, bắt buộc), `name` (string, tùy chọn), `capacity` (integer, bắt buộc), `active` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 25. PATCH `/api/operations/tables/{id}`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `existing`; **role:** `MANAGER`.
- **Nghiệp vụ:** Sửa bàn/khóa bàn. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** `TablePatch` — `areaId` (string, tùy chọn), `name` (string, tùy chọn), `capacity` (integer, tùy chọn), `active` (boolean, tùy chọn)
- **Success:** 200: `Table` — `id` (string, bắt buộc), `areaId` (string, bắt buộc), `name` (string, tùy chọn), `capacity` (integer, bắt buộc), `active` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 26. GET `/api/operations/areas`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `STAFF|MANAGER`.
- **Nghiệp vụ:** Quản lý khu vực. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `AreaArray` — xem `#/components/schemas/AreaArray`
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 27. POST `/api/operations/areas`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `MANAGER`.
- **Nghiệp vụ:** Thêm khu vực. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `AreaInput` — `id` (string, bắt buộc), `name` (string, bắt buộc), `active` (boolean, tùy chọn)
- **Success:** 201: `Area` — `id` (string, bắt buộc), `name` (string, bắt buộc), `active` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 28. PATCH `/api/operations/areas/{id}`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `MANAGER`.
- **Nghiệp vụ:** Sửa khu vực. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** `AreaInput` — `id` (string, bắt buộc), `name` (string, bắt buộc), `active` (boolean, tùy chọn)
- **Success:** 200: `Area` — `id` (string, bắt buộc), `name` (string, bắt buộc), `active` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 29. GET `/api/operations/slot-configs`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `STAFF|MANAGER`.
- **Nghiệp vụ:** Danh sách định nghĩa ca. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `SlotConfigArray` — xem `#/components/schemas/SlotConfigArray`
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 30. POST `/api/operations/slot-configs`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `MANAGER`.
- **Nghiệp vụ:** Tạo ca. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `SlotConfigInput` — `code` (string, bắt buộc), `startsAtLocal` (string, bắt buộc), `endsAtLocal` (string, bắt buộc), `active` (boolean, tùy chọn)
- **Success:** 201: `SlotConfig` — `code` (string, bắt buộc), `startsAtLocal` (string, bắt buộc), `endsAtLocal` (string, bắt buộc), `active` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 31. PATCH `/api/operations/slot-configs/{code}`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `MANAGER`.
- **Nghiệp vụ:** Sửa ca. 
- **Path/query/header:** `path: code` (bắt buộc, string)
- **Request JSON:** `SlotConfigInput` — `code` (string, bắt buộc), `startsAtLocal` (string, bắt buộc), `endsAtLocal` (string, bắt buộc), `active` (boolean, tùy chọn)
- **Success:** 200: `SlotConfig` — `code` (string, bắt buộc), `startsAtLocal` (string, bắt buộc), `endsAtLocal` (string, bắt buộc), `active` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 32. GET `/api/operations/stats/summary`
- **Chủ trì:** Người 2 (Operations); **trạng thái starter:** `planned`; **role:** `MANAGER`.
- **Nghiệp vụ:** Thống kê theo trạng thái trong DB Operations. 
- **Path/query/header:** `query: date` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `StatsSummary` — `date` (string, bắt buộc), `total` (integer, bắt buộc), `requested` (integer, tùy chọn), `confirmed` (integer, tùy chọn), `checkedIn` (integer, tùy chọn), `completed` (integer, tùy chọn), `cancelled` (integer, tùy chọn), `noShow` (integer, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 33. GET `/api/tracking/bookings/{id}/timeline`
- **Chủ trì:** Người 3 (Tracking); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Timeline các state event; đảm bảo owner/role. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Timeline` — `bookingId` (string, bắt buộc), `currentState` (string/REQUESTED|CONFIRMED|REJECTED|CANCELLED|CHECKED_IN|SEATED|COMPLETED|NO_SHOW, tùy chọn), `version` (integer, tùy chọn), `gapDetected` (boolean, tùy chọn), `events` (array, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 34. GET `/api/tracking/bookings/{id}/status`
- **Chủ trì:** Người 3 (Tracking); **trạng thái starter:** `planned`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Read model trạng thái và phiên bản mới nhất. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Booking` — `bookingId` (string, bắt buộc), `customerId` (string, bắt buộc), `slotId` (string, bắt buộc), `partySize` (integer, bắt buộc), `note` (string, tùy chọn), `state` (string/REQUESTED|CONFIRMED|REJECTED|CANCELLED|CHECKED_IN|SEATED|COMPLETED|NO_SHOW, bắt buộc), `version` (integer, bắt buộc), `tableId` (string, tùy chọn), `createdAt` (string, tùy chọn), `updatedAt` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 35. GET `/api/notifications/mine`
- **Chủ trì:** Người 3 (Notification); **trạng thái starter:** `existing`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Thông báo tài khoản hiện tại. 
- **Path/query/header:** `query: page` (tùy chọn, integer); `query: limit` (tùy chọn, integer); `query: unreadOnly` (tùy chọn, boolean)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `NotificationList` — `data` (array, bắt buộc), `meta` (ref:PageMeta, bắt buộc), `unreadCount` (integer, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 36. GET `/api/notifications/unread-count`
- **Chủ trì:** Người 3 (Notification); **trạng thái starter:** `planned`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Số thông báo chưa đọc. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `UnreadCount` — `unreadCount` (integer, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 37. POST `/api/notifications/{id}/read`
- **Chủ trì:** Người 3 (Notification); **trạng thái starter:** `adapt`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Đánh dấu đã đọc; starter hiện dùng eventId. 
- **Path/query/header:** `path: id` (bắt buộc, string)
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Notification` — `id` (string, bắt buộc), `eventId` (string, tùy chọn), `bookingId` (string, bắt buộc), `type` (string, tùy chọn), `title` (string, bắt buộc), `message` (string, bắt buộc), `readAt` (string, tùy chọn), `createdAt` (string, bắt buộc), `deliveryStatus` (string, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 38. POST `/api/notifications/read-all`
- **Chủ trì:** Người 3 (Notification); **trạng thái starter:** `planned`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Đánh dấu tất cả đã đọc. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `Ok` — `ok` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 39. GET `/api/notifications/preferences`
- **Chủ trì:** Người 3 (Notification); **trạng thái starter:** `planned`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Xem tùy chọn thông báo. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `NotificationPreferences` — `emailEnabled` (boolean, bắt buộc), `inAppEnabled` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 40. PATCH `/api/notifications/preferences`
- **Chủ trì:** Người 3 (Notification); **trạng thái starter:** `planned`; **role:** `CUSTOMER|STAFF|MANAGER`.
- **Nghiệp vụ:** Cập nhật tùy chọn thông báo. 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** `NotificationPreferences` — `emailEnabled` (boolean, bắt buộc), `inAppEnabled` (boolean, bắt buộc)
- **Success:** 200: `NotificationPreferences` — `emailEnabled` (boolean, bắt buộc), `inAppEnabled` (boolean, bắt buộc)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

### 41. GET `/api/health`
- **Chủ trì:** Người 1 (Gateway); **trạng thái starter:** `existing`; **role:** `PUBLIC`.
- **Nghiệp vụ:** Health của Gateway (hiện trả gateway ok). 
- **Path/query/header:** Không có tham số bắt buộc ngoài JWT nếu protected.
- **Request JSON:** Không có JSON body.
- **Success:** 200: `GatewayHealth` — `gateway` (string, bắt buộc), `ok` (boolean, tùy chọn)
- **Test tối thiểu:** request hợp lệ; 400 nếu sai validation; 401 thiếu/sai token (nếu bảo vệ); 403 role sai; 404 tài nguyên không tồn tại hoặc không thuộc quyền; 409 cạnh tranh/trạng thái nếu có.

## Quy tắc CI

1. Build/contract test phải đọc `contracts/openapi/restaurant-api-v2.yaml`; FE generate types từ cùng nguồn.
2. Đổi request/response schema: cần owner backend + người 5 review. Đổi event cần cả producer và consumer review.
3. API `existing` không đồng nghĩa xong; mỗi owner chuyển sang done **sau khi** migration, test và E2E gateway đạt.
