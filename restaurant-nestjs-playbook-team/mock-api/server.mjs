/**
 * Restaurant API V2 stateful mock. Node 22+, zero dependencies.
 * DEV ONLY. Fake Bearer tokens, plaintext demo passwords, in-memory state,
 * NO real RabbitMQ, email, JWT, database, or delivery guarantees.
 */
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
const PORT=Number(process.env.PORT || 4010);
const HOST=process.env.HOST || '127.0.0.1';
const lag=Number(process.env.MOCK_EVENT_DELAY_MS ?? 200);
const now=()=>new Date().toISOString();
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const slotPattern=/^\d{4}-\d{2}-\d{2}-(lunch|dinner)$/;
const allowed={REQUESTED:['CONFIRMED','REJECTED','CANCELLED'], CONFIRMED:['CHECKED_IN','CANCELLED','NO_SHOW'], CHECKED_IN:['SEATED'], SEATED:['COMPLETED']};
const seedUsers=[
 {id:'11111111-1111-4111-8111-111111111111',email:'guest@example.test',fullName:'Nguyễn Khách',role:'CUSTOMER',phone:'0900000001',active:true,password:'Demo123!'},
 {id:'22222222-2222-4222-8222-222222222222',email:'staff@example.test',fullName:'Lê Lễ tân',role:'STAFF',phone:'0900000002',active:true,password:'Demo123!'},
 {id:'33333333-3333-4333-8333-333333333333',email:'manager@example.test',fullName:'Trần Quản lý',role:'MANAGER',phone:'0900000003',active:true,password:'Demo123!'}
];
let S;const publicUser=u=>u && Object.fromEntries(Object.entries(u).filter(([k])=>k!=='password'));
const clone=o=>structuredClone(o);
function reset(){
 S={
  users:clone(seedUsers),tokens:new Map(),refresh:new Map(),idempotency:new Map(),
  restaurant:{id:'rest-001',name:'Nhà hàng Demo',timezone:'Asia/Ho_Chi_Minh',address:'Đà Nẵng',phone:'0236000000',cancelBeforeMinutes:120,noShowAfterMinutes:15,checkinEarlyMinutes:30},
  areas:[{id:'main',name:'Sảnh chính',active:true},{id:'garden',name:'Sân vườn',active:true}],
  tables:[{id:'T01',areaId:'main',name:'Bàn 1',capacity:2,active:true},{id:'T02',areaId:'main',name:'Bàn 2',capacity:4,active:true},{id:'T03',areaId:'main',name:'Bàn 3',capacity:6,active:true},{id:'T04',areaId:'garden',name:'Bàn 4',capacity:4,active:true}],
  slotConfigs:[{code:'lunch',startsAtLocal:'11:30',endsAtLocal:'13:00',active:true},{code:'dinner',startsAtLocal:'18:00',endsAtLocal:'19:30',active:true}],
  bookings:[],timelines:new Map(),notifications:[],commands:[],prefs:new Map()
 };
 const id='44444444-4444-4444-8444-444444444444';
 S.bookings.push({bookingId:id,customerId:seedUsers[0].id,slotId:'2026-11-10-dinner',partySize:2,note:'Bàn yên tĩnh',contactPhone:'0900000001',state:'REQUESTED',version:1,tableId:null,createdAt:now(),updatedAt:now()});
 S.timelines.set(id,[{eventId:randomUUID(),bookingId:id,previousState:null,state:'REQUESTED',aggregateVersion:1,actorId:'system',reason:'Seed demo',occurredAt:now()}]);
 S.prefs.set(seedUsers[0].id,{emailEnabled:true,inAppEnabled:true});
}
reset();
function reply(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body));}
function fail(code,message,status=400,details){throw {code,message,status,details};}
function pagination(items,url){const page=Math.max(1,Number(url.searchParams.get('page')||1)),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20)));
 return {data:items.slice((page-1)*limit,page*limit),meta:{page,limit,total:items.length,totalPages:Math.ceil(items.length/limit)}};}
const lower=s=>String(s||'').trim().toLowerCase();
const bstr=x=>JSON.stringify(x||{});
function must(body,fields){for(const f of fields)if(body?.[f]===undefined||body?.[f]===null||body?.[f]==='')fail('VALIDATION_ERROR',`Thiếu ${f}`,400);}
function auth(req,roles){const token=(req.headers.authorization||'').replace(/^Bearer /i,'');const uid=S.tokens.get(token);const user=S.users.find(u=>u.id===uid&&u.active);
 if(!user)fail('UNAUTHORIZED','Cần đăng nhập',401);if(roles && !roles.includes(user.role))fail('FORBIDDEN','Không đủ quyền',403);return user;}
function own(user,b){if(!b || (user.role==='CUSTOMER' && b.customerId!==user.id))fail('NOT_FOUND','Không tìm thấy đặt bàn',404);return b;}
function findBooking(id){return S.bookings.find(x=>x.bookingId===id);}
function isAllocated(tableId,slotId,exclude){return S.bookings.some(x=>x.bookingId!==exclude&&x.tableId===tableId&&x.slotId===slotId&&['CONFIRMED','CHECKED_IN','SEATED','COMPLETED'].includes(x.state));}
function notice(b,state){const id=randomUUID();S.notifications.unshift({id,eventId:id,bookingId:b.bookingId,customerId:b.customerId,type:`BOOKING_${state}`,title:`Đặt bàn: ${state}`,message:`Yêu cầu ${b.bookingId.slice(0,8)} chuyển sang ${state}`,readAt:null,createdAt:now(),deliveryStatus:'MOCK_SENT'});}
function transition(b,target,actor,reason=null,tableId){
 if(!(allowed[b.state]||[]).includes(target))fail('INVALID_TRANSITION',`${b.state} không thể chuyển sang ${target}`,409);
 if(target==='CONFIRMED'){
  const t=S.tables.find(t=>t.id===tableId&&t.active);
  if(!t||t.capacity<b.partySize)fail('TABLE_UNAVAILABLE','Bàn không đủ sức chứa hoặc đã khóa',409);
  if(isAllocated(tableId,b.slotId,b.bookingId))fail('TABLE_CONFLICT','Bàn đã được phân cho booking khác ở cùng ca',409);
  b.tableId=tableId;
 }
 const prev=b.state;b.state=target;b.version++;b.updatedAt=now();
 const event={eventId:randomUUID(),bookingId:b.bookingId,previousState:prev,state:target,aggregateVersion:b.version,actorId:actor,reason,occurredAt:now()};
 S.timelines.get(b.bookingId).push(event);notice(b,target);
 return {bookingId:b.bookingId,state:b.state,version:b.version,tableId:b.tableId};
}
function toSlot(date,c){const mk=time=>`${date}T${time}:00+07:00`;return {code:c.code,date,startsAt:mk(c.startsAtLocal),endsAt:mk(c.endsAtLocal),bookingOpen:c.active};}
function tableActiveInSlot(tid,slotId){return !isAllocated(tid,slotId);}
function requestJson(req){return new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>1024*1024){reject({code:'PAYLOAD_TOO_LARGE',message:'Tối đa 1 MB',status:413});req.destroy();}});req.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch{reject({code:'INVALID_JSON',message:'JSON không hợp lệ',status:400});}});req.on('error',reject);});}
const match=(path,regex)=>path.match(regex);
async function route(req,res,url,body){const method=req.method,path=url.pathname;
 if(path==='/__mock/reset'&&method==='POST'){reset();return reply(res,200,{ok:true,devOnly:true});}
 if(path==='/__mock/state'&&method==='GET')return reply(res,200,{users:S.users.length,bookings:S.bookings.length,notifications:S.notifications.length,mode:'MOCK_ONLY'});
 if(path==='/api/health'&&method==='GET')return reply(res,200,{ok:true,gateway:'mock',mode:'stateful-demo'});
 // AUTH
 if(path==='/api/auth/register'&&method==='POST'){
  must(body,['email','password','fullName']);if(String(body.password).length<8)fail('VALIDATION_ERROR','Mật khẩu ít nhất 8 ký tự');
  if(S.users.some(u=>u.email===lower(body.email)))fail('EMAIL_EXISTS','Email đã tồn tại',409);
  const u={id:randomUUID(),email:lower(body.email),fullName:body.fullName,phone:body.phone||null,role:'CUSTOMER',active:true,password:body.password};S.users.push(u);return reply(res,201,publicUser(u));
 }
 if(path==='/api/auth/login'&&method==='POST'){
  must(body,['email','password']);const u=S.users.find(x=>x.email===lower(body.email)&&x.password===body.password&&x.active);
  if(!u)fail('INVALID_CREDENTIALS','Sai tài khoản/mật khẩu',401);
  const token='mock-'+randomUUID(),refresh='refresh-'+randomUUID();S.tokens.set(token,u.id);S.refresh.set(refresh,u.id);
  return reply(res,200,{accessToken:token,tokenType:'Bearer',expiresIn:900,user:publicUser(u)},{'Set-Cookie':`refresh=${refresh}; HttpOnly; SameSite=Lax; Path=/api/auth`});
 }
 if(path==='/api/auth/refresh'&&method==='POST'){
  const cookie=req.headers.cookie?.match(/(?:^|; )refresh=([^;]+)/);const old=cookie&&S.refresh.get(cookie[1]);if(!old)fail('UNAUTHORIZED','Refresh session không tồn tại',401);
  S.refresh.delete(cookie[1]);const refresh='refresh-'+randomUUID(),token='mock-'+randomUUID();S.refresh.set(refresh,old);S.tokens.set(token,old);
  return reply(res,200,{accessToken:token,tokenType:'Bearer',expiresIn:900,user:publicUser(S.users.find(u=>u.id===old))},{'Set-Cookie':`refresh=${refresh}; HttpOnly; SameSite=Lax; Path=/api/auth`});
 }
 if(path==='/api/auth/logout'&&method==='POST'){
  const cookie=req.headers.cookie?.match(/(?:^|; )refresh=([^;]+)/);if(cookie)S.refresh.delete(cookie[1]);
  return reply(res,200,{ok:true},{'Set-Cookie':'refresh=; Max-Age=0; Path=/api/auth'});
 }
 if(path==='/api/auth/change-password'&&method==='POST'){
  const u=auth(req);must(body,['currentPassword','newPassword']);if(u.password!==body.currentPassword)fail('INVALID_PASSWORD','Mật khẩu hiện tại không đúng',400);
  if(String(body.newPassword).length<8)fail('VALIDATION_ERROR','Mật khẩu phải có 8 ký tự');u.password=body.newPassword;return reply(res,200,{ok:true});
 }
 if(path==='/api/users/me'){
  const u=auth(req);if(method==='GET')return reply(res,200,publicUser(u));
  if(method==='PATCH'){if(body.fullName)u.fullName=body.fullName;if(body.phone!==undefined)u.phone=body.phone;return reply(res,200,publicUser(u));}
 }
 if(path==='/api/users/staff'){
  auth(req,['MANAGER']);if(method==='GET')return reply(res,200,pagination(S.users.filter(u=>u.role==='STAFF').map(publicUser),url));
  if(method==='POST'){
   must(body,['email','password','fullName']);if(S.users.some(u=>u.email===lower(body.email)))fail('EMAIL_EXISTS','Trùng email',409);
   const u={id:randomUUID(),email:lower(body.email),fullName:body.fullName,phone:null,password:body.password,role:'STAFF',active:true};S.users.push(u);return reply(res,201,publicUser(u));
  }
 }
 let m=match(path,/^\/api\/users\/([^/]+)\/status$/);
 if(m&&method==='PATCH'){auth(req,['MANAGER']);const u=S.users.find(x=>x.id===m[1]);if(!u)fail('NOT_FOUND','Không có tài khoản',404);
  if(typeof body.active!=='boolean')fail('VALIDATION_ERROR','active phải boolean');if(u.role==='MANAGER')fail('FORBIDDEN','Không khóa manager demo',403);
  u.active=body.active;return reply(res,200,publicUser(u));}
 // Public catalog
 if(path==='/api/restaurants/current'&&method==='GET')return reply(res,200,S.restaurant);
 if(path==='/api/restaurants/current/areas'&&method==='GET')return reply(res,200,S.areas.filter(x=>x.active));
 if(path==='/api/slots'&&method==='GET'){
  const date=url.searchParams.get('date');if(!datePattern.test(date||''))fail('VALIDATION_ERROR','date phải là YYYY-MM-DD');
  return reply(res,200,S.slotConfigs.filter(x=>x.active).map(x=>toSlot(date,x)));
 }
 if(path==='/api/availability'&&method==='GET'){
  const date=url.searchParams.get('date'),code=url.searchParams.get('slotCode'),size=Number(url.searchParams.get('partySize'));
  if(!datePattern.test(date||'')||!S.slotConfigs.some(x=>x.code===code&&x.active)||!Number.isInteger(size)||size<1)fail('VALIDATION_ERROR','date, slotCode, partySize không hợp lệ');
  const slotId=`${date}-${code}`,availableTableCount=S.tables.filter(t=>t.active&&t.capacity>=size&&tableActiveInSlot(t.id,slotId)).length;
  return reply(res,200,{date,slotCode:code,partySize:size,available:availableTableCount>0,availableTableCount,note:'Chỉ tham khảo, không giữ bàn'});
 }
 // Booking APIs
 if(path==='/api/bookings'&&method==='POST'){
  const u=auth(req);must(body,['slotId','partySize']);const key=req.headers['idempotency-key'];
  if(!key||String(key).length<8)fail('IDEMPOTENCY_KEY_REQUIRED','Thiếu Idempotency-Key (>=8 ký tự)');
  if(!slotPattern.test(body.slotId)||!Number.isInteger(body.partySize)||body.partySize<1||body.partySize>12)fail('VALIDATION_ERROR','slotId/partySize không hợp lệ');
  const idKey=u.id+':'+key,hash=createHash('sha256').update(bstr(body)).digest('hex'),prev=S.idempotency.get(idKey);
  if(prev){if(prev.hash!==hash)fail('IDEMPOTENCY_CONFLICT','Cùng key nhưng payload khác',409);return reply(res,202,prev.receipt);}
  const id=randomUUID(),createdAt=now();const b={bookingId:id,customerId:u.id,slotId:body.slotId,partySize:body.partySize,note:body.note||'',contactPhone:body.contactPhone||u.phone,state:null,version:0,tableId:null,createdAt,updatedAt:createdAt};
  S.bookings.push(b);S.timelines.set(id,[]);const receipt={bookingId:id,processingStatus:'QUEUED',createdAt};S.idempotency.set(idKey,{hash,receipt});
  setTimeout(()=>{if(S.bookings.includes(b)&&b.version===0){b.state='REQUESTED';b.version=1;b.updatedAt=now();S.timelines.get(id)?.push({eventId:randomUUID(),bookingId:id,previousState:null,state:'REQUESTED',aggregateVersion:1,actorId:'system',reason:'Request received (mock)',occurredAt:now()});notice(b,'REQUESTED');}},lag);
  return reply(res,202,receipt);
 }
 if(path==='/api/bookings/mine'&&method==='GET'){
  const u=auth(req);let rows=S.bookings.filter(b=>b.customerId===u.id);
  if(url.searchParams.get('state'))rows=rows.filter(b=>b.state===url.searchParams.get('state'));return reply(res,200,pagination(rows.slice().reverse(),url));
 }
 m=match(path,/^\/api\/bookings\/commands\/([^/]+)$/);
 if(m&&method==='GET'){const u=auth(req),c=S.commands.find(x=>x.commandId===m[1]&&x.customerId===u.id);
  if(!c)fail('NOT_FOUND','Không có command',404);return reply(res,200,c);}
 m=match(path,/^\/api\/bookings\/([^/]+)\/cancellation-requests$/);
 if(m&&method==='POST'){
  const u=auth(req),b=own(u,findBooking(m[1]));const commandId=randomUUID();const command={commandId,bookingId:b.bookingId,customerId:u.id,status:'PENDING',reason:body.reason||null,createdAt:now(),resolvedAt:null};S.commands.push(command);
  setTimeout(()=>{if(!S.commands.includes(command)||!S.bookings.includes(b))return;
   if(['REQUESTED','CONFIRMED'].includes(b.state)) {transition(b,'CANCELLED',u.id,command.reason||'Khách yêu cầu hủy');command.status='ACCEPTED';}
   else{command.status='REJECTED';command.reason='Không được hủy tại trạng thái hiện tại';}command.resolvedAt=now();
  },lag);return reply(res,202,{commandId,bookingId:b.bookingId,status:'PENDING'});
 }
 m=match(path,/^\/api\/bookings\/([^/]+)$/);
 if(m&&method==='GET'){const u=auth(req);return reply(res,200,own(u,findBooking(m[1])));}
 // Operations
 if(path==='/api/operations/reservations'&&method==='GET'){
  auth(req,['STAFF','MANAGER']);let rows=S.bookings.filter(b=>b.version>0);
  const state=url.searchParams.get('state'),slotId=url.searchParams.get('slotId'),date=url.searchParams.get('date');if(state)rows=rows.filter(b=>b.state===state);if(slotId)rows=rows.filter(b=>b.slotId===slotId);if(date)rows=rows.filter(b=>b.slotId.startsWith(date));
  return reply(res,200,pagination(rows.slice().reverse(),url));
 }
 m=match(path,/^\/api\/operations\/reservations\/([^/]+)$/);
 if(m&&method==='GET'){auth(req,['STAFF','MANAGER']);const b=findBooking(m[1]);if(!b)fail('NOT_FOUND','Không thấy reservation',404);return reply(res,200,b);}
 m=match(path,/^\/api\/operations\/reservations\/([^/]+)\/(confirm|reject|check-in|seat|complete|no-show|cancel)$/);
 if(m&&method==='POST'){
  const u=auth(req,['STAFF','MANAGER']),b=findBooking(m[1]);if(!b||!b.state)fail('NOT_FOUND','Không thấy reservation',404);
  if(!Number.isInteger(body.expectedVersion)||body.expectedVersion!==b.version)fail('VERSION_CONFLICT','expectedVersion đã cũ',409);
  const target={'confirm':'CONFIRMED','reject':'REJECTED','check-in':'CHECKED_IN','seat':'SEATED','complete':'COMPLETED','no-show':'NO_SHOW','cancel':'CANCELLED'}[m[2]];
  if(['REJECTED','CANCELLED'].includes(target)&&!String(body.reason||'').trim())fail('VALIDATION_ERROR','Thiếu reason');
  if(target==='CONFIRMED'&&!body.tableId)fail('VALIDATION_ERROR','Thiếu tableId');
  return reply(res,200,transition(b,target,u.id,body.reason||null,body.tableId));
 }
 if(path==='/api/operations/tables'){
  auth(req,['STAFF','MANAGER']);if(method==='GET')return reply(res,200,S.tables);
  if(method==='POST'){
   auth(req,['MANAGER']);must(body,['id','areaId','capacity']);if(S.tables.some(t=>t.id===body.id))fail('DUPLICATE','Trùng ID bàn',409);
   if(!S.areas.some(a=>a.id===body.areaId))fail('VALIDATION_ERROR','Khu vực không tồn tại');
   const t={id:body.id,areaId:body.areaId,name:body.name||body.id,capacity:body.capacity,active:true};S.tables.push(t);return reply(res,201,t);
  }
 }
 m=match(path,/^\/api\/operations\/tables\/([^/]+)$/);
 if(m&&method==='PATCH'){
  auth(req,['MANAGER']);const t=S.tables.find(x=>x.id===m[1]);if(!t)fail('NOT_FOUND','Không có bàn',404);
  if(body.active===false&&S.bookings.some(b=>b.tableId===t.id&&['CONFIRMED','CHECKED_IN','SEATED'].includes(b.state)))fail('TABLE_BUSY','Bàn đang giữ chỗ',409);
  if(body.capacity!==undefined&&(!Number.isInteger(body.capacity)||body.capacity<1))fail('VALIDATION_ERROR','capacity không hợp lệ');
  for(const k of ['active','capacity','areaId','name'])if(body[k]!==undefined)t[k]=body[k];return reply(res,200,t);
 }
 if(path==='/api/operations/areas'){
  auth(req,['STAFF','MANAGER']);if(method==='GET')return reply(res,200,S.areas);
  if(method==='POST'){auth(req,['MANAGER']);must(body,['id','name']);if(S.areas.some(x=>x.id===body.id))fail('DUPLICATE','Trùng mã khu vực',409);const a={id:body.id,name:body.name,active:body.active!==false};S.areas.push(a);return reply(res,201,a);}
 }
 m=match(path,/^\/api\/operations\/areas\/([^/]+)$/);
 if(m&&method==='PATCH'){auth(req,['MANAGER']);const a=S.areas.find(x=>x.id===m[1]);if(!a)fail('NOT_FOUND','Không có khu vực',404);Object.assign(a,Object.fromEntries(Object.entries(body).filter(([k])=>['name','active'].includes(k))));return reply(res,200,a);}
 if(path==='/api/operations/slot-configs'){
  auth(req,['STAFF','MANAGER']);if(method==='GET')return reply(res,200,S.slotConfigs);
  if(method==='POST'){auth(req,['MANAGER']);must(body,['code','startsAtLocal','endsAtLocal']);if(S.slotConfigs.some(x=>x.code===body.code))fail('DUPLICATE','Trùng ca',409);
   const x={code:body.code,startsAtLocal:body.startsAtLocal,endsAtLocal:body.endsAtLocal,active:body.active!==false};S.slotConfigs.push(x);return reply(res,201,x);}
 }
 m=match(path,/^\/api\/operations\/slot-configs\/([^/]+)$/);
 if(m&&method==='PATCH'){auth(req,['MANAGER']);const s=S.slotConfigs.find(x=>x.code===m[1]);if(!s)fail('NOT_FOUND','Không có ca',404);
  for(const k of ['startsAtLocal','endsAtLocal','active'])if(body[k]!==undefined)s[k]=body[k];return reply(res,200,s);}
 if(path==='/api/operations/stats/summary'&&method==='GET'){
  auth(req,['MANAGER']);const date=url.searchParams.get('date');if(!datePattern.test(date||''))fail('VALIDATION_ERROR','date phải là YYYY-MM-DD');
  const list=S.bookings.filter(x=>x.slotId.startsWith(date));const count=s=>list.filter(x=>x.state===s).length;
  return reply(res,200,{date,total:list.length,requested:count('REQUESTED'),confirmed:count('CONFIRMED'),checkedIn:count('CHECKED_IN'),completed:count('COMPLETED'),cancelled:count('CANCELLED'),noShow:count('NO_SHOW')});
 }
 // Tracking
 m=match(path,/^\/api\/tracking\/bookings\/([^/]+)\/(timeline|status)$/);
 if(m&&method==='GET'){
  const u=auth(req),b=own(u,findBooking(m[1]));
  if(m[2]==='status')return reply(res,200,b);
  return reply(res,200,{bookingId:b.bookingId,currentState:b.state,version:b.version,gapDetected:false,events:S.timelines.get(b.bookingId)||[]});
 }
 // Notification
 if(path==='/api/notifications/mine'&&method==='GET'){
  const u=auth(req);let rows=S.notifications.filter(n=>n.customerId===u.id);
  if(url.searchParams.get('unreadOnly')==='true')rows=rows.filter(n=>!n.readAt);
  return reply(res,200,{...pagination(rows,url),unreadCount:S.notifications.filter(n=>n.customerId===u.id&&!n.readAt).length});
 }
 if(path==='/api/notifications/unread-count'&&method==='GET'){
  const u=auth(req);return reply(res,200,{unreadCount:S.notifications.filter(n=>n.customerId===u.id&&!n.readAt).length});
 }
 if(path==='/api/notifications/read-all'&&method==='POST'){
  const u=auth(req);S.notifications.filter(n=>n.customerId===u.id).forEach(n=>n.readAt=now());return reply(res,200,{ok:true});
 }
 if(path==='/api/notifications/preferences'){
  const u=auth(req);const pref=S.prefs.get(u.id)||{emailEnabled:true,inAppEnabled:true};
  if(method==='GET')return reply(res,200,pref);
  if(method==='PATCH'){const x={...pref,...Object.fromEntries(Object.entries(body).filter(([k,v])=>['emailEnabled','inAppEnabled'].includes(k)&&typeof v==='boolean'))};S.prefs.set(u.id,x);return reply(res,200,x);}
 }
 m=match(path,/^\/api\/notifications\/([^/]+)\/read$/);
 if(m&&method==='POST'){
  const u=auth(req),n=S.notifications.find(x=>(x.id===m[1]||x.eventId===m[1])&&x.customerId===u.id);
  if(!n)fail('NOT_FOUND','Thông báo không tồn tại',404);n.readAt=now();return reply(res,200,n);
 }
 fail('NOT_FOUND',`${method} ${path} không có trong mock`,404);
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',req.headers.origin==='http://localhost:5173'?req.headers.origin:'http://localhost:5173');
 res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,Idempotency-Key');res.setHeader('Access-Control-Allow-Credentials','true');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
 try{const body=['POST','PATCH','PUT'].includes(req.method)?await requestJson(req):{};await route(req,res,url,body);}
 catch(e){reply(res,e?.status||500,{code:e?.code||'INTERNAL_ERROR',message:e?.message||'Lỗi hệ thống mock',correlationId:randomUUID(),...(e?.details?{details:e.details}:{})});}
});
server.listen(PORT,HOST,()=>console.log(`Restaurant mock on http://${HOST}:${PORT} (DEVELOPMENT ONLY)`));
