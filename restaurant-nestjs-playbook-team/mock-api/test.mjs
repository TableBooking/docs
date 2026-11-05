import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const PORT=41439, BASE=`http://127.0.0.1:${PORT}`;
async function ready(){for(let i=0;i<70;i++){try{const x=await fetch(`${BASE}/api/health`);if(x.ok)return;}catch{} await new Promise(r=>setTimeout(r,60));}throw new Error('server not responding');}
async function request(method,path,payload,token,extra={}){const resp=await fetch(BASE+path,{method,headers:{...(payload?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...extra},body:payload?JSON.stringify(payload):undefined});return {status:resp.status,data:await resp.json()};}
async function login(email){const res=await request('POST','/api/auth/login',{email,password:'Demo123!'});assert.equal(res.status,200);return res.data.accessToken;}
let server;
test('stateful mock end-to-end with roles, idempotency, concurrency',async()=>{
 server=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:String(PORT)}});try{
 await ready();
 let guest=await login('guest@example.test'),staff=await login('staff@example.test'),manager=await login('manager@example.test');
 const input={slotId:'2026-11-10-lunch',partySize:4,note:'Demo e2e'},headers={'Idempotency-Key':'test-unique-key-100'};
 let a=await request('POST','/api/bookings',input,guest,headers);assert.equal(a.status,202);
 let dup=await request('POST','/api/bookings',input,guest,headers);assert.equal(dup.status,202);assert.equal(dup.data.bookingId,a.data.bookingId);
 let conflict=await request('POST','/api/bookings',{...input,note:'different'},guest,headers);assert.equal(conflict.status,409);
 await new Promise(r=>setTimeout(r,350));
 let mine=await request('GET','/api/bookings/mine',null,guest);assert.equal(mine.status,200);assert.ok(mine.data.data.some(x=>x.bookingId===a.data.bookingId));
 let denied=await request('POST',`/api/operations/reservations/${a.data.bookingId}/confirm`,{tableId:'T02',expectedVersion:1},guest);assert.equal(denied.status,403);
 let confirm=await request('POST',`/api/operations/reservations/${a.data.bookingId}/confirm`,{tableId:'T02',expectedVersion:1},staff);assert.equal(confirm.status,200);assert.equal(confirm.data.state,'CONFIRMED');
 let stale=await request('POST',`/api/operations/reservations/${a.data.bookingId}/check-in`,{expectedVersion:1},staff);assert.equal(stale.status,409);
 let another=await request('POST','/api/bookings',{slotId:'2026-11-10-lunch',partySize:2},guest,{'Idempotency-Key':'test-unique-key-101'});await new Promise(r=>setTimeout(r,350));
 let occupied=await request('POST',`/api/operations/reservations/${another.data.bookingId}/confirm`,{tableId:'T02',expectedVersion:1},staff);assert.equal(occupied.status,409);
 let read=await request('GET',`/api/tracking/bookings/${a.data.bookingId}/timeline`,null,guest);assert.equal(read.status,200);assert.equal(read.data.events.length,2);
 let cancel=await request('POST',`/api/bookings/${a.data.bookingId}/cancellation-requests`,{reason:'Không đến được'},guest);assert.equal(cancel.status,202);
 await new Promise(r=>setTimeout(r,350));
 let command=await request('GET',`/api/bookings/commands/${cancel.data.commandId}`,null,guest);assert.equal(command.data.status,'ACCEPTED');
 let reclaimed=await request('POST',`/api/operations/reservations/${another.data.bookingId}/confirm`,{tableId:'T02',expectedVersion:1},staff);assert.equal(reclaimed.status,200);
 let notify=await request('GET','/api/notifications/mine',null,guest);assert.equal(notify.status,200);assert.ok(notify.data.unreadCount>=3);
 let managerCreate=await request('POST','/api/users/staff',{email:'newstaff@example.test',password:'Demo123!',fullName:'B'},manager);assert.equal(managerCreate.status,201);
 let staffDenied=await request('POST','/api/users/staff',{email:'newstaff2@example.test',password:'Demo123!',fullName:'B'},staff);assert.equal(staffDenied.status,403);
 const avail=await request('GET','/api/availability?date=2026-11-10&slotCode=lunch&partySize=4');assert.equal(avail.status,200);
 const reset=await request('POST','/__mock/reset');assert.equal(reset.status,200);
 }finally{server.kill('SIGTERM');await once(server,'exit').catch(()=>{});}
});
