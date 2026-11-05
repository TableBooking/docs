-- Idempotent baseline data, for a fresh operations_db after applying target schema.sql.
INSERT INTO restaurants(id,name,address,phone,timezone) VALUES
 ('rest-001','Nhà hàng Demo','Đà Nẵng','0236000000','Asia/Ho_Chi_Minh')
ON CONFLICT(id) DO NOTHING;
INSERT INTO dining_areas(id,restaurant_id,name) VALUES
 ('main','rest-001','Sảnh chính'),('garden','rest-001','Sân vườn')
ON CONFLICT(id) DO NOTHING;
INSERT INTO dining_tables(id,area_id,name,capacity) VALUES
 ('T01','main','Bàn 1',2),('T02','main','Bàn 2',4),
 ('T03','main','Bàn 3',6),('T04','garden','Bàn 4',4)
ON CONFLICT(id) DO NOTHING;
INSERT INTO service_slot_configs(code,restaurant_id,starts_at_local,ends_at_local) VALUES
 ('lunch','rest-001','11:30','13:00'),('dinner','rest-001','18:00','19:30')
ON CONFLICT(code) DO NOTHING;
