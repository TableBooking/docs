# GIT, LOCAL DEV, COMPOSE, CI/CD VÀ DEPLOY — NGƯỜI 1 CHỦ TRÌ, CẢ NHÓM PHỐI HỢP

## A. Hai repo và quyền sửa

```text
restaurant-platform/                    # Git repo 1: người 1 quản lý integration
  services/auth/                        # Owner người 1
  services/operations/                  # Owner người 2
  services/tracking/                    # Owner người 3
  services/notification/                # Owner người 3
  services/booking/                     # Owner người 4
  shared/                               # PR review 2 bên khi sửa hợp đồng
  db/{auth,operations,booking,tracking,notification}/
  contracts/{openapi,events}/           # Single source of truth
  infra/gateway/nginx.conf              # Owner người 1
  compose.yaml, deploy/, .github/workflows/
restaurant-web/                         # Git repo 2: người 5
  src/features/{auth,booking,operations,tracking,notifications,management}/
  src/api/generated/
  Dockerfile
```

Backend monorepo không làm 5 services thành monolith nếu mỗi service có entrypoint/container, DB role, migration, deploy image độc lập. FE repo riêng **không** cần git submodule. Clone hai repo ngang hàng vì V1 `compose.yaml` build web context `../restaurant-web`.

## B. GitHub/GitLab workflow (ví dụ)

- Branch chuẩn: `feat/auth-refresh`, `feat/ops-confirm`, `feat/tracking-projection`, `feat/notif-worker`, `feat/booking-cancel`, `feat/fe-staff-board`, `chore/compose-healthchecks`.
- `main` protected; một PR = một chức năng có migration/DTO/test; reviewer owner bị ảnh hưởng; status checks pass. Merge sớm mỗi 1–2 ngày.
- Tránh mọi người cùng sửa `compose.yaml`/`shared/events.ts`/OpenAPI. Người 1 là người merge cuối cùng file hạ tầng; người 2/3/4 cùng approve event contract.
- Commit image tag bằng full/short SHA; không chỉ dùng `latest`; release manifest ghi 5 backend image tags + 1 FE tag tương thích nhau.
- Code review checklist: không query DB khác, no secret, JWT guards, migrations, errors, tests, event version, idempotency.

## C. Chạy local từ source baseline

**Yêu cầu:** Node 22, Docker Desktop/Engine + Compose. Đảm bảo có `.env` dev không commit và key dev.

```bash
# hai thư mục ngang cấp
# workspace/restaurant-platform
# workspace/restaurant-web
cd restaurant-platform
node scripts/generate-keys.mjs
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 booking operations tracking notification auth gateway
```

V1 dùng `postgres:16-alpine`, `rabbitmq:3.13-management-alpine`, `nginx`, `mailpit`, năm NestJS service, một `web` container. **Các tag trong V1 là baseline, không phải khuyến nghị security pin production**; production pin image digest/version được kiểm thử. Host Gateway `http://localhost:8080`; Mailpit `http://localhost:8025`; management RabbitMQ local `http://localhost:15672` (chỉ localhost).

**Quan trọng:** Nếu đang chuyển V1→V2 SQL, **không chạy bộ source/query V1 trên DB schema V2**. Tạo compose override mới + migration V2 trên volume DB mới; kiểm tra `shared/schemas.ts` auto-init đã tắt trước khi run.

FE độc lập dùng Vite: trong `restaurant-web` chạy `npm install`, `npm run dev`; proxy `/api` trỏ tới Gateway 8080. Mock-only (khi backend chưa xong): `cd restaurant-platform/mock-api && node server.mjs`; FE proxy tới 4010.

## D. Docker Compose phải chứa thành phần nào và public gì?

| Container | Số lượng | Network | Công khai? |
|---|---:|---|---|
| HTTPS reverse proxy / API Gateway Nginx | 1 (có thể hợp nhất chức năng) | frontend + backend | Chỉ 80/443 production |
| React web static | 1 | public/internal | Qua HTTPS proxy |
| auth, booking, operations, tracking, notification | 5 | backend | Không public direct port |
| RabbitMQ + management plugin | 1 | backend | Không public 5672/15672; admin qua SSH tunnel |
| PostgreSQL | 1 server + 5 **logical DBs/roles** | backend | Không public 5432 |
| Mailpit | 1 dev/test only | backend | Không public production |

Đăng nhập vào VPS và chạy `docker compose` không cần cài Node trên VPS nếu image đã build/publish từ CI; **không copy repo FE source vào backend repo để deploy**.

## E. CI pipeline thực tế nên có

1. PR backend: lint/typecheck, NestJS tests từng service, contract test JSON Schema/OpenAPI, integration test DB/broker cho service bị đổi.
2. PR FE: typecheck, tests và `npm run build` + smoke mock/contract.
3. Merge `main`: build 5 images backend riêng theo `SERVICE=<name>` (source V1 Dockerfile có build context chung), build 1 image FE; push GHCR/GitLab Registry với SHA; scan cơ bản.
4. Staging deploy: kéo image/tag đã pin, chạy migrations compatible trước khi restart; smoke Gateway + 5 /health và E2E golden path.
5. Promote production/demo: deploy đúng release manifest; tag rollback, backup và changelog. Có thể cho CI chỉ build và người 1 bấm deploy thủ công để giảm rủi ro kỳ đồ án.

## F. Deploy một VPS (tối thiểu cho demo thật)

- Cài Docker Engine + Compose plugin, thiết lập firewall chỉ inbound 22 (giới hạn IP), 80, 443. Cấu hình domain và TLS qua Caddy/Nginx/Traefik; Gateway có thể kiêm reverse proxy, không phải bắt buộc 2 gateway.
- Set env/secret an toàn: DB passwords, `RABBITMQ_PASSWORD`, JWT private key (chỉ auth), public key mount vào 4 services, SMTP credentials, domain cookie. Dùng file secrets bên ngoài Git hoặc secret store; không in ra CI logs.
- Docker network `backend` riêng, không publish DB/AMQP ports; volumes persistent `pg_data`, `rabbit_data`. Production cần backup PostgreSQL, kiểm thử restore; RabbitMQ single node không phải HA.
- Provision queues/bindings **một lần cho tất cả services** trước khi phát messages; nếu broker dữ liệu bị reset cần bootstrap topology trước khi đưa hệ thống nhận traffic. Đặc biệt phải có notification queue ngay cả khi Notification container không chạy.
- Healthchecks HTTP của services, DB pg_isready, broker diagnostics. `depends_on healthy` giúp thứ tự startup nhưng không thay thế **connection retry** trong NestJS khi mạng/broker tạm mất.
- Logging cấu trúc tối thiểu: service, timestamp, level, correlationId, eventId, bookingId; không log JWT, refresh cookies, password/email không cần.
- Backup/restore định kỳ và thử 1 lần trước demo; môi trường demo dùng Mailpit, sản phẩm thực tế dùng SMTP provider được cấu hình bảo mật.

### Các lệnh chạy minh họa (sau khi tạo prod overlay)

```bash
# Trên VPS, compose.yaml + prod overlay tham chiếu registry images có tag theo SHA
# Thực thi migration đã được CI kiểm thử và sao lưu DB trước khi upgrade
docker compose --env-file .env.prod -f compose.yaml -f deploy/compose.prod.yaml pull
docker compose --env-file .env.prod -f compose.yaml -f deploy/compose.prod.yaml up -d --no-build
docker compose ps
# Rollback: đổi IMAGE_TAG về release trước và up -d (chú ý migration DB compatibility)
```

`deploy/compose.prod.yaml` là **file cần người 1 tạo**, không có sẵn đầy đủ trong starter V1. Không chạy ngay nếu chưa viết manifest production.

## G. Giám sát và quyền truy cập

- Prometheus/Grafana/ELK là mở rộng, không bắt buộc. Với đồ án hãy ít nhất có Docker logs, queue depth (`messages_ready`), consumer count, DLQ count, outbox pending và SMTP attempts.
- Cấu hình policy auto cleanup dữ liệu demo riêng; retention PII, backup encryption nếu đưa lên Internet; HTTPS luôn bật.
- Rate-limit login/register; cookie Secure/SameSite phù hợp; kiểm soát CORS, CSRF cho refresh-cookie operations, role guards và ownership.

## H. Phân công DevOps không làm người 1 bị quá tải

Người 1 là **chủ tích hợp** Gateway/Compose/CI; người 2/3/4 **tự viết Dockerfile/service health/test**, sửa file riêng, cung cấp env và migration; người 5 tự build FE image, docs FE env và PR cấu hình route. Người 1 review/merge thay đổi hạ tầng, không tự gỡ lỗi toàn bộ business logic cho cả nhóm.
