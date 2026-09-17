const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.FUEL_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'fuel-test-'));
const {server}=require('./server.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let checks=0;
async function call(route,data,cookie){const res=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {status:res.status,value:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
function eq(a,b){assert.deepEqual(a,b);checks++}
const account=(name,email)=>({name,email,password:'LongPassword!2026'});
try{
eq((await call('stations')).status,401);
eq((await call('setup',account('Owner','owner@example.com'))).status,201);
eq((await call('setup',account('Intruder','intruder@example.com'))).status,403);
const root=(await call('login',{email:'owner@example.com',password:'LongPassword!2026'})).cookie;
const a=(await call('stations',{name:'Station A',owner:'A',city:'Lahore'},root)).value;
const b=(await call('stations',{name:'Station B',owner:'B',city:'Karachi'},root)).value;
for(const [name,s] of [['a',a],['b',b]])eq((await call('users',{...account(name,name+'@example.com'),stationId:s.id},root)).status,201);
const adminA=(await call('login',{email:'a@example.com',password:'LongPassword!2026'})).cookie;
const adminB=(await call('login',{email:'b@example.com',password:'LongPassword!2026'})).cookie;
eq((await call('stations',null,adminA)).status,403);
const worker=(await call('users',{...account('Worker','worker@example.com'),stationId:b.id,role:'super_admin'},adminA)).value;
eq(worker.stationId,a.id);eq(worker.role,'salesman');eq((await call('users',null,adminB)).value.length,0);eq((await call('users',null,adminA)).value.length,1);eq('hash' in worker,false);
const salesman=(await call('login',{email:'worker@example.com',password:'LongPassword!2026'})).cookie;
eq((await call('users',null,salesman)).status,403);eq((await call('stations',null,salesman)).status,403);eq((await call('assignments',null,salesman)).value,[]);
await call('logout',{},salesman);eq((await call('me',null,salesman)).status,401);

const totals=(await call('dashboard',null,root)).value;eq(totals.totalStations,2);eq(totals.totalAdmins,2);eq(totals.totalSalesmen,1);eq((await call('dashboard',null,adminA)).status,403);
eq((await call('stations/'+a.id,null,adminA)).status,403);
eq((await call('stations/'+a.id,{...a,name:'Updated station',status:'inactive'},adminA)).status,403);
eq((await call('stations/'+a.id,{...a,name:'Updated station',status:'inactive'},root)).status,200);
eq((await call('stations?q=updated',null,root)).value.length,1);
eq((await call('me',null,adminA)).status,401);
eq((await call('login',{email:'a@example.com',password:'LongPassword!2026'})).status,401);
eq((await call('dashboard',null,root)).value.inactiveStations,1);
const detail=(await call('stations/'+a.id,null,root)).value;eq(detail.createdByName,'Owner');eq(detail.admins.length,1);eq(detail.salesmen,1);eq('hash' in detail.admins[0],false);
eq((await call('stations/'+a.id,{...a,status:'active'},root)).status,200);
eq((await call('me',null,adminA)).status,401);
const freshAdmin=(await call('login',{email:'a@example.com',password:'LongPassword!2026'})).cookie;
eq((await call('me',null,freshAdmin)).status,200);
const target=detail.admins[0];eq((await call('users/'+target.id,{...target,name:'Changed name',status:'inactive'},root)).status,200);
eq((await call('me',null,freshAdmin)).status,401);
eq((await call('users/'+target.id,{...target,email:'b@example.com'},root)).status,409);
eq((await call('users/'+target.id,{...target,stationId:b.id},root)).status,400);
eq((await call('users/'+target.id,{...target},adminB)).status,403);
eq((await call('stations/'+a.id,{...a,status:'wrong'},root)).status,400);
eq((await call('stations/'+a.id,{...a,email:'invalid'},root)).status,400);
const audit=JSON.parse(fs.readFileSync(path.join(process.env.FUEL_DATA_DIR,'store.json'),'utf8')).audit;
assert(audit.some(a=>a.action==='station_updated'&&a.previous.status==='active'&&a.next.status==='inactive'));checks++;

// Phase 3 is verified in the separate temporary station store.
await call('users/'+target.id,{...target,status:'active'},root);
const sa=(await call('login',{email:'a@example.com',password:'LongPassword!2026'})).cookie;
const create=async(kind,data,cookie=sa)=>{const r=await call('config/'+kind,data,cookie);eq(r.status,201);return r.value};
eq((await call('config/fuels',null,root)).status,403);
const fuel=await create('fuels',{name:'Petrol',amount:'280.25',status:'active'});
eq((await call('config/rates',null,sa)).value[0].amountMinor,28025);
eq((await call('config/fuels',null,adminB)).value.length,0);
eq((await call('config/fuels/'+fuel.id,{name:'Stolen',status:'active'},adminB)).status,404);
eq((await call('config/fuels',{name:'petrol',amount:'2',status:'active'},sa)).status,409);
eq((await call('config/fuels',{name:'Bad',amount:'2.005',status:'active'},sa)).status,400);
const future=new Date(Date.now()+86400000).toISOString();
await create('rates',{fuelId:fuel.id,amount:'290',effectiveAt:future});
const rates=(await call('config/rates',null,sa)).value;eq(rates.length,2);eq(rates[0].amountMinor,28025);
eq((await call('config/rates/'+rates[0].id,{amount:'1'},sa)).status,403);
eq((await call('config/rates',{fuelId:fuel.id,amount:'1',effectiveAt:'2020-01-01T00:00:00Z'},sa)).status,400);
const machine=await create('machines',{name:'Pump 1',code:'P1',status:'active'});
eq((await call('config/nozzles',{number:'1',machineId:machine.id,fuelId:fuel.id,status:'active'},adminB)).status,400);
const nozzle=await create('nozzles',{number:'1',machineId:machine.id,fuelId:fuel.id,status:'active'});
const shift=await create('shifts',{name:'Night',startTime:'22:00',endTime:'06:00',status:'active'});
eq((await call('config/shifts',{name:'Invalid',startTime:'25:00',endTime:'06:00',status:'active'},sa)).status,400);
const person=await create('salesmen',{...account('Phase 3 worker','phase3@example.com'),employeeId:'E3',phone:'03001234567',joiningDate:'2026-09-01',status:'active',stationId:b.id});eq(person.stationId,a.id);eq('hash' in person,false);
const personal=(await call('login',{email:'phase3@example.com',password:'LongPassword!2026'})).cookie;
eq((await call('config/fuels',null,personal)).status,403);
const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const assignment=await create('assignments',{salesmanId:person.id,machineId:machine.id,shiftId:shift.id,date});
eq((Date.parse(assignment.endsAt)-Date.parse(assignment.startsAt))/3600000,8);
eq(assignment.snapshot.nozzles[0].fuelName,'Petrol');
eq((await call('config/assignments',{salesmanId:person.id,machineId:machine.id,shiftId:shift.id,date},sa)).status,409);
eq((await call('config/assignments',null,personal)).value.length,1);
eq((await call('config/assignments',null,adminB)).value.length,0);
eq((await call('config/assignments/'+assignment.id,{action:'cancel'},personal)).status,403);
eq((await call('config/machines/'+machine.id,{...machine,status:'inactive'},sa)).status,409);
eq((await call('config/fuels/'+fuel.id,{...fuel,status:'inactive'},sa)).status,409);
eq((await call('config/nozzles/'+nozzle.id,{...nozzle,number:'2'},sa)).status,409);
eq((await call('config/salesmen/'+person.id,{...person,status:'inactive'},sa)).status,409);
eq((await call('config/shifts/'+shift.id,{...shift,name:'Renamed night'},sa)).status,200);
eq((await call('config/assignments/'+assignment.id,null,sa)).value.snapshot.shiftName,'Night');
eq((await call('config/assignments/'+assignment.id,{action:'cancel'},sa)).status,200);
eq((await call('config/assignments/'+assignment.id,null,sa)).value.status,'cancelled');
eq((await call('config/salesmen/'+person.id,{...person,status:'inactive'},sa)).status,200);
eq((await call('me',null,personal)).status,401);
eq((await call('config/machines/'+machine.id,{...machine,status:'inactive'},sa)).status,200);
eq((await call('config/salesmen',null,adminB)).value.length,0);

// Phase 4: two-nozzle capture, protected evidence, immutable completion.
await call('config/salesmen/'+person.id,{...person,status:'active'},sa);
await call('config/machines/'+machine.id,{...machine,status:'active'},sa);
await create('nozzles',{number:'2',machineId:machine.id,fuelId:fuel.id,status:'active'});
const login4=(await call('login',{email:person.email,password:'LongPassword!2026'})).cookie;
const a4=await create('assignments',{salesmanId:person.id,machineId:machine.id,shiftId:shift.id,date:new Date(Date.now()+5*86400000).toISOString().slice(0,10)});
eq((await call('runs',{assignmentId:a4.id},sa)).status,403);
const r4=(await call('runs',{assignmentId:a4.id},login4)).value;eq(r4.status,'opening');eq(r4.readings.length,2);
eq((await call('runs/'+r4.id,null,adminB)).status,404);
eq((await call('runs/'+r4.id+'/activate',{},login4)).status,400);
eq((await call('runs/'+r4.id+'/end',{},login4)).status,400);
eq((await call('config/assignments/'+a4.id,{action:'cancel'},sa)).status,409);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=';
eq((await call('runs/'+r4.id+'/reading',{nozzleId:r4.readings[0].nozzleId,value:'25000'},login4)).status,400);
eq((await call('runs/'+r4.id+'/reading',{nozzleId:r4.readings[0].nozzleId,value:'25000',photo:'data:text/html;base64,aGVsbG8='},login4)).status,400);
let captured;for(let i=0;i<2;i++){const out=await call('runs/'+r4.id+'/reading',{nozzleId:r4.readings[i].nozzleId,value:i?'100':'25000',photo:png},login4);eq(out.status,200);captured=out.value;}
const photoId=captured.readings[0].opening.photoId;
for(const [cookie,status] of [[sa,200],[login4,200],[adminB,404],[root,404]]){const response=await fetch(base+'/api/evidence/'+photoId,{headers:{Cookie:cookie}});eq(response.status,status);}
eq((await call('runs/'+r4.id+'/activate',{},login4)).value.status,'active');
await create('rates',{fuelId:fuel.id,amount:'999',effectiveAt:new Date().toISOString()});
eq((await call('runs/'+r4.id+'/reading',{nozzleId:r4.readings[0].nozzleId,value:'1',photo:png},login4)).status,400);
eq((await call('runs/'+r4.id+'/end',{},login4)).value.status,'closing');
eq((await call('runs/'+r4.id+'/review',{cash:'0'},login4)).status,400);
eq((await call('runs/'+r4.id+'/reading',{nozzleId:r4.readings[0].nozzleId,value:'2',photo:png},login4)).status,400);
for(let i=0;i<2;i++)eq((await call('runs/'+r4.id+'/reading',{nozzleId:r4.readings[i].nozzleId,value:i?'110':'25700',photo:png},login4)).status,200);
const review=(await call('runs/'+r4.id+'/review',{cash:'190000',expectedMinor:1},login4)).value;
eq(review.calculation.totalMilli,710000);eq(review.calculation.expectedMinor,19897750);eq(review.calculation.varianceMinor,-897750);eq(review.readings[0].rateMinor,28025);
eq((await call('runs/'+r4.id+'/revise',{},login4)).value.status,'closing');
eq((await call('runs/'+r4.id+'/review',{cash:'190000'},login4)).value.status,'review');
const done=(await call('runs/'+r4.id+'/submit',{},login4)).value;eq(done.status,'completed');eq((await call('runs/'+r4.id+'/submit',{},login4)).value.completedAt,done.completedAt);
eq((await call('runs/'+r4.id+'/reading',{nozzleId:r4.readings[0].nozzleId,value:'2'},login4)).status,403);
eq((await call('runs/'+r4.id+'/revise',{},sa)).status,403);
eq((await call('runs/'+r4.id,null,sa)).value.calculation.expectedMinor,19897750);
eq((await call('config/assignments/'+a4.id,null,sa)).value.status,'completed');

{ const engine=require('./reconciliation.cjs');
const sampleNozzle=(id,fuel,opening,closing,rate)=>({nozzleId:id,fuelId:fuel,fuelName:fuel,opening:{value:opening},closing:{value:closing},rateMinor:rate});
const mix=[sampleNozzle('1','Petrol',1000,701000,28000),sampleNozzle('2','Diesel',0,10000,29000),sampleNozzle('3','Petrol',0,1000,28000)];
const totals=engine.calculate(mix,19918000);eq(totals.totalMilli,711000);eq(totals.expectedMinor,19918000);eq(totals.balance,'balanced');eq(totals.fuelSales.length,2);eq(totals.fuelSales[0].volumeMilli,701000);eq(totals.fuelSales[0].expectedMinor,19628000);eq(totals.fuelSales[0].nozzleCount,2);
eq(engine.calculate(mix,0).balance,'shortage');eq(engine.calculate(mix,20000000).balance,'excess');
eq(engine.calculate([sampleNozzle('z','Petrol',1000,1000,28000)],0).expectedMinor,0);
eq(engine.calculate([sampleNozzle('a','Petrol',0,1,500)],0).expectedMinor,1);
eq(engine.calculate([sampleNozzle('a','Petrol',0,1,499)],0).expectedMinor,0);
eq(engine.calculate([sampleNozzle('a','Petrol',0,1,500),sampleNozzle('b','Petrol',0,1,500)],0).expectedMinor,2);
eq(engine.parseDecimal('0.01',2),1);eq(engine.parseDecimal('1.13',2),113);eq(engine.parseDecimal('12.345',3),12345);
for(const value of ['-1','1e3','NaN','Infinity','0.001','',{},'1.2.3']){assert.throws(()=>engine.parseDecimal(value,2),/valid/);checks++;}
assert.throws(()=>engine.calculate([sampleNozzle('a','Petrol',2,1,28000)],0),/lower/);checks++;
assert.throws(()=>engine.calculate([sampleNozzle('a','Petrol',0,1,0)],0),/greater/);checks++;
assert.throws(()=>engine.calculate([mix[0],mix[0]],0),/repeated/);checks++;
assert.throws(()=>engine.calculate([sampleNozzle('a','Petrol',0,Number.MAX_SAFE_INTEGER,100000000)],0),/large/);checks++;
const intact={readings:mix,calculation:totals};eq(engine.reconcile(intact).matches,true);const corrupt=JSON.parse(JSON.stringify(intact));corrupt.calculation.expectedMinor++;eq(engine.reconcile(corrupt).matches,false);const badGroup=JSON.parse(JSON.stringify(intact));badGroup.calculation.fuelSales[0].volumeMilli++;eq(engine.reconcile(badGroup).matches,false);
const legacy=JSON.parse(JSON.stringify(intact));delete legacy.calculation.version;delete legacy.calculation.fuelSales;eq(engine.reconcile(legacy).matches,true);eq(engine.reconcile(legacy).version,1);
const verification=(await call('runs/'+r4.id+'/reconciliation',null,sa));eq(verification.status,200);eq(verification.value.matches,true);eq(verification.value.calculation.fuelSales[0].volumeMilli,710000);
eq((await call('runs/'+r4.id+'/reconciliation',null,adminB)).status,404);eq((await call('runs/'+r4.id+'/reconciliation',null,root)).status,403);
const persisted=JSON.parse(fs.readFileSync(path.join(process.env.FUEL_DATA_DIR,'store.json'),'utf8')).runs.find(r=>r.id===r4.id);eq(engine.reconcile(persisted).matches,true);eq(persisted.calculation.expectedMinor,19897750);
} {
const dash=require('./dashboard.cjs');
eq(dash.dayKey('2026-09-17T18:59:59Z'),'2026-09-17');eq(dash.dayKey('2026-09-17T19:00:00Z'),'2026-09-18');
const example=(id,station,status,at)=>({id,stationId:station,status,salesmanId:'person-'+id,assignmentId:'a-'+id,createdAt:at,startedAt:at,completedAt:status==='completed'?at:undefined,snapshot:{salesmanName:'Worker',machineName:'Pump',shiftName:'Morning'},readings:[{opening:{value:1,photoId:'o'},closing:{value:2,photoId:'c'}}],calculation:status==='completed'?{totalMilli:1000,expectedMinor:28000,cashMinor:27000,varianceMinor:-1000}:null});
const data={runs:[example('1','A','completed','2026-09-17T20:00:00Z'),example('2','A','completed','2026-09-17T18:00:00Z'),example('3','B','completed','2026-09-17T20:00:00Z'),example('4','A','active','2026-09-18T01:00:00Z'),example('5','A','review','2026-09-18T01:00:00Z')],machines:[{stationId:'A',status:'active'},{stationId:'B',status:'active'}],assignments:[{id:'a-4',endsAt:'2026-09-18T00:00:00Z'}]};
const summary=dash.dashboard(data,'A',new Date('2026-09-18T02:00:00Z'));
eq(summary.totals.expectedMinor,28000);eq(summary.totals.cashMinor,27000);eq(summary.totals.varianceMinor,-1000);eq(summary.counts.completedShifts,1);eq(summary.counts.activeMachines,1);eq(summary.counts.activeSalesmen,1);eq(summary.inProgress.length,2);eq(summary.recentCompleted[0].id,'1');eq(summary.exceptions.some(e=>e.issue==='Cash shortage'),true);eq(summary.exceptions.some(e=>e.issue==='Overdue incomplete shift'),true);eq(summary.exceptions.some(e=>e.issue==='Awaiting final submission'),true);eq(summary.trend.length,7);eq(summary.trend[5].salesMinor,28000);eq(summary.trend[6].salesMinor,28000);eq(summary.exceptions.some(e=>e.id==='3'),false);
const missing=dash.dashboard(data,'A',new Date('2026-09-18T02:00:00Z'),()=>false);eq(missing.exceptions.some(e=>e.issue==='Missing reading evidence'),true);
const empty=dash.dashboard({runs:[],machines:[],assignments:[]},'A');eq(empty.totals.fuelMilli,0);eq(empty.inProgress.length,0);
eq((await call('station-dashboard',null,sa)).status,200);eq((await call('station-dashboard',null,root)).status,403);eq((await call('station-dashboard',null,login4)).status,403);eq((await call('station-dashboard',null,adminB)).value.totals.expectedMinor,0);eq((await call('station-dashboard',null,sa)).value.totals.expectedMinor,19897750);
} {
const reporting=require('./reports.cjs'),book=require('./xlsx.cjs');
const report=(await call('reports',null,sa));eq(report.status,200);eq(report.value.rows.length,1);eq(report.value.totals.expectedMinor,19897750);eq(report.value.performance.fuels.length,1);eq(report.value.performance.salesmen[0].name,'Phase 3 worker');
eq((await call('reports',null,root)).status,403);eq((await call('reports',null,login4)).status,403);eq((await call('reports',null,adminB)).value.rows.length,0);
eq((await call('reports?from=2026-02-30',null,sa)).status,400);eq((await call('reports?from=2027-01-01&to=2026-01-01',null,sa)).status,400);eq((await call('reports?machineId=foreign',null,sa)).value.rows.length,0);eq((await call('reports?fuelId='+fuel.id,null,sa)).value.rows.length,1);
const events=(await call('audit',null,sa));eq(events.status,200);assert(events.value.events.length>0);checks++;assert(events.value.events.every(e=>e.stationId===a.id));checks++;eq((await call('audit',null,login4)).status,403);
const csv=reporting.csv([['=HYPERLINK("bad")','Comma, name','Line\nBreak'],[-12,42,'Plain']]);assert(csv.includes("'=HYPERLINK"));checks++;assert(csv.includes('"Comma, name"'));checks++;
for(const format of ['csv','xlsx']){const response=await fetch(base+'/api/reports/export?format='+format,{headers:{Cookie:sa}});eq(response.status,200);assert(response.headers.get('content-disposition').includes('.'+format));checks++;const bytes=Buffer.from(await response.arrayBuffer());if(format==='xlsx'){eq(bytes.readUInt32LE(0),0x04034b50);assert(bytes.includes(Buffer.from('Shift report')));checks++;assert(!bytes.includes(Buffer.from('<f>')));checks++;}else assert(bytes.toString().includes('Phase 3 worker'));}
eq((await fetch(base+'/api/reports/export?format=xlsx',{headers:{Cookie:login4}})).status,403);
} {
const hostile=await fetch(base+'/api/users',{method:'POST',headers:{'Content-Type':'application/json',Cookie:sa,Origin:'https://attacker.invalid'},body:'{}'});eq(hostile.status,403);
eq((await fetch(base+'/api/users',{method:'POST',headers:{'Content-Type':'text/plain',Cookie:sa},body:'{}'})).status,415);
eq((await fetch(base+'/api/users',{method:'POST',headers:{'Content-Type':'application/json',Cookie:sa},body:'null'})).status,400);
eq(await new Promise((resolve,reject)=>require('http').get(base+'/api/status',{headers:{Host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode)}).on('error',reject)),403);
eq((await call('logout',null,sa)).status,405);eq((await call('me',null,sa)).status,200);
const concurrent=await Promise.all([call('users',{...account('Race','race@example.com')},sa),call('users',{...account('Race','race@example.com')},sa)]);eq(concurrent.map(r=>r.status).sort(),[201,409]);
const page=await fetch(base);eq(page.status,200);assert(page.headers.get('content-security-policy').includes("script-src 'sha256-"));checks++;assert(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));checks++;eq(page.headers.get('x-content-type-options'),'nosniff');const served=await page.text();const inline=served.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\r\n?/g,'\n');const digest=require('crypto').createHash('sha256').update(inline).digest('base64');assert(page.headers.get('content-security-policy').includes(digest));checks++;
eq((await fetch(base+'/api/reports',{method:'DELETE',headers:{Cookie:sa}})).status,405);
} {
const recovery=require('./backup.cjs'),source=process.env.FUEL_DATA_DIR,backup=source+'-backup',restored=source+'-restored';const count=recovery.backup(source,backup);assert(count>1);checks++;eq(recovery.restore(backup,restored),count);eq(fs.readFileSync(path.join(restored,'store.json'),'utf8'),fs.readFileSync(path.join(source,'store.json'),'utf8'));assert.throws(()=>recovery.restore(backup,restored),/empty/);checks++;fs.appendFileSync(path.join(backup,'store.json'),' ');assert.throws(()=>recovery.restore(backup,source+'-bad'),/integrity/);checks++;
} {
const analytics=(await call('analytics',null,sa));eq(analytics.status,200);eq(analytics.value.kpis.completedShifts,1);eq(analytics.value.daily.length,1);eq(analytics.value.daily[0].revenueMinor,19897750);eq(analytics.value.daily[0].fuelMilli,710000);eq(analytics.value.performance.fuels.reduce((s,f)=>s+f.expectedMinor,0),analytics.value.totals.expectedMinor);eq(analytics.value.kpis.shortageMinor,897750);eq((await call('analytics',null,login4)).status,403);eq((await call('analytics',null,adminB)).value.totals.expectedMinor,0);eq((await call('analytics?from=2020-01-01&to=2026-01-01',null,sa)).status,400);
} {
const meter=require('./meter-reconciliation.cjs');const interval={stationId:'A',machineId:'M',from:'2026-09-01T00:00:00.000Z',to:'2026-09-08T00:00:00.000Z',readings:[{nozzleId:'N',number:'1',fuelName:'Petrol',opening:25000000,closing:32000000}]};
const shiftRun=(id,start,end,open,close)=>({id,stationId:'A',machineId:'M',status:'completed',startedAt:start,endedAt:end,snapshot:{salesmanName:'Worker'},readings:[{nozzleId:'N',opening:{value:open},closing:{value:close}}]});
const fixture={runs:[shiftRun('one','2026-09-01T00:00:00.000Z','2026-09-04T00:00:00.000Z',25000000,28000000),shiftRun('two','2026-09-04T00:00:00.000Z','2026-09-08T00:00:00.000Z',28000000,32000000)]};
eq(meter.compare(fixture,interval)[0].status,'Matched');eq(meter.compare(fixture,interval)[0].salesmanVolume,7000000);
const mismatch=JSON.parse(JSON.stringify(interval));mismatch.readings[0].closing+=1000;eq(meter.compare(fixture,mismatch)[0].status,'Mismatch');eq(meter.compare(fixture,mismatch)[0].volumeDifference,-1000);
eq(meter.compare({runs:[]},interval)[0].status,'Incomplete');const foreign=JSON.parse(JSON.stringify(fixture));foreign.runs.forEach(r=>r.stationId='B');eq(meter.compare(foreign,interval)[0].shifts.length,0);
const crossing=JSON.parse(JSON.stringify(fixture));crossing.runs[0].startedAt='2026-08-31T23:00:00.000Z';eq(meter.compare(crossing,interval)[0].status,'Incomplete');
const gap=JSON.parse(JSON.stringify(fixture));gap.runs[1].readings[0].opening.value+=1000;eq(meter.compare(gap,interval)[0].status,'Mismatch');eq(meter.compare(gap,interval)[0].issues.includes('Meter gap between consecutive salesman shifts'),true);
const overlap=JSON.parse(JSON.stringify(fixture));overlap.runs[1].startedAt='2026-09-03T23:00:00.000Z';eq(meter.compare(overlap,interval)[0].status,'Incomplete');
eq((await call('reconciliation-settings',null,sa)).value.frequency,'weekly');eq((await call('reconciliation-settings',{frequency:'monthly'},sa)).value.frequency,'monthly');eq((await call('reconciliation-settings',{frequency:'yearly'},sa)).status,400);
const savedRun=(await call('runs/'+r4.id,null,sa)).value;const input={machineId:machine.id,frequency:'weekly',from:savedRun.startedAt,to:savedRun.endedAt,readings:savedRun.readings.map(n=>({nozzleId:n.nozzleId,opening:String(n.opening.value/1000),closing:String(n.closing.value/1000)}))};
const created=await call('meter-reconciliations',input,sa);eq(created.status,201);eq(created.value.status,'Matched');const recId=created.value.id;
eq((await call('meter-reconciliations/'+recId,null,adminB)).status,404);eq((await call('meter-reconciliations',null,login4)).status,403);eq((await call('meter-reconciliations',null,root)).status,403);
eq((await call('meter-reconciliations',input,sa)).status,409);eq((await call('meter-reconciliations',{...input,to:new Date(Date.now()+3600000).toISOString()},sa)).status,400);
input.readings[0].closing=String(Number(input.readings[0].closing)+1);const corrected=(await call('meter-reconciliations/'+recId,input,sa)).value;eq(corrected.status,'Mismatch');eq(corrected.revision,2);eq(corrected.revisions[0].status,'Matched');
const checked=(await call('meter-reconciliations/'+recId+'/recheck',{},sa)).value;eq(checked.revision,3);eq(checked.revisions.length,2);eq((await call('meter-reconciliations',null,adminB)).value.length,0);
} const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);checks++;
console.log(checks+' checks passed: authentication, roles, station isolation, hierarchy, logout, UI syntax, dashboard, station editing/search, account updates, deactivation, audit, fuel rates, equipment, shift schedules, assignments, snapshots, fuel aggregation, rounding, reconciliation and historical integrity.');
}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});


