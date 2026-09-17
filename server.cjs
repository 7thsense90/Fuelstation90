const meterComparison=require('./meter-reconciliation.cjs');
const reporting=require('./reports.cjs'), excelExport=require('./xlsx.cjs');
const operationsDashboard=require('./dashboard.cjs');
const reconciliation=require('./reconciliation.cjs');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const runtime=require('./runtime.cjs').configuration();
const cloud=process.env.SUPABASE_URL?new (require('./supabase-store.cjs').SupabaseStore)():null;
let cloudRevision=0;
const root=__dirname,file=path.join(process.env.FUEL_DATA_DIR||path.join(root,'data'),'store.json');
if(!cloud)fs.mkdirSync(path.dirname(file),{recursive:true});
let db=!cloud&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{users:[],stations:[],audit:[]};
for(const kind of ['fuels','rates','machines','nozzles','shifts','assignments','runs','meterReconciliations'])db[kind] ||= [];
if(!cloud&&runtime.production&&!db.users.some(u=>u.role==='super_admin'&&u.status==='active'))throw Error('Restore a verified store with an active Super Admin before production startup.');
const sessions=new Map(),attempts=new Map();
const id=()=>crypto.randomUUID();
const sessionKey=token=>crypto.createHash('sha256').update(token||'').digest('hex');
async function save(){if(cloud){cloudRevision=await cloud.save(db,sessions,cloudRevision);return;}const fd=fs.openSync(file+'.tmp','w');try{fs.writeFileSync(fd,JSON.stringify(db,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(file+'.tmp',file);}
function password(p,s=crypto.randomBytes(16).toString('hex')){return {salt:s,hash:crypto.scryptSync(p,s,64).toString('hex')};}
function verify(p,u){return crypto.timingSafeEqual(Buffer.from(password(p,u.salt).hash,'hex'),Buffer.from(u.hash,'hex'));}
function clean(u){const {hash,salt,...rest}=u;return rest;}
function audit(u,action,target,previous=null,next=null){db.audit.push({id:id(),actor:u.id,stationId:u.stationId||null,action,target,previous,next,time:new Date().toISOString()});}
function fail(status,message){throw Object.assign(new Error(message),{status});}
function validUser(b){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>150||typeof b.email!=='string'||b.email.length>254||!/^\S+@\S+\.\S+$/.test(b.email||'')||typeof b.password!=='string'||b.password.length<12||b.password.length>1024)fail(400,'Enter a name, valid email, and password of at least 12 characters.');if(db.users.some(u=>u.email===b.email.toLowerCase().trim()))fail(409,'This email already has an account.');}
function addUser(b,role,stationId){validUser(b);const u={id:id(),name:b.name.trim(),email:b.email.toLowerCase().trim(),phone:b.phone||'',role,stationId,status:'active',...password(b.password)};db.users.push(u);return u;}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>(req.url.includes('/reading')?4500000:20000))fail(413,'Request is too large.');}try{const result=JSON.parse(text||'{}');if(!result||Array.isArray(result)||typeof result!=='object')fail(400,'Invalid request.');return result;}catch{fail(400,'Invalid request.')}}
async function handle(req,res){
let beforeMutation;
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');
const send=(s,v)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
try{
const url=new URL(req.url,'http://localhost'),route=url.pathname;
if(!runtime.acceptsHost(req.headers.host))fail(403,'Use the configured portal address to connect.');
if(runtime.origin)res.setHeader('Strict-Transport-Security','max-age=31536000');
if(cloud&&route.startsWith('/api/')){const state=await cloud.load();db=state.db;cloudRevision=state.revision;sessions.clear();for(const [key,value]of state.sessions)if(value.expires>Date.now())sessions.set(key,value);if(runtime.production&&!db.users.some(u=>u.role==='super_admin'&&u.status==='active'))fail(503,'Cloud database needs an active Super Admin.');}
if(route==='/api/health'&&req.method==='GET')return send(200,{ok:true,storage:cloud?'supabase':'local'});
if(!['GET','POST'].includes(req.method))fail(405,'This action is not supported.');
if(req.method==='POST'){if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail(415,'Send this action as JSON.');if(req.headers['sec-fetch-site']==='cross-site')fail(403,'Cross-site actions are not allowed.');beforeMutation=JSON.stringify(db);}
if(route==='/api/logout'&&req.method!=='POST')fail(405,'Sign out requires confirmation from the page.');
if(['/api/status','/api/me'].includes(route)&&req.method!=='GET')fail(405,'This action is not supported.');
if(req.method!=='GET'&&req.headers.origin&&!runtime.acceptsOrigin(req.headers.origin,req.headers.host))fail(403,'Request origin is not allowed.');
if(route==='/api/status')return send(200,{setupRequired:db.users.length===0});
if(route==='/api/setup'&&req.method==='POST'){if(runtime.production)fail(403,'Initial setup is disabled on the hosted portal.');if(db.users.length)fail(403,'Initial setup has already been completed.');const b=await body(req);const u=addUser(b,'super_admin',null);audit(u,'platform_initialized',u.id);await save();return send(201,{ok:true});}
if(route==='/api/login'&&req.method==='POST'){
const b=await body(req);const email=String(b.email).toLowerCase().trim();if(cloud&&!await cloud.loginAttempt(email))fail(429,'Too many attempts. Try again in 15 minutes.');
const ip=cloud?email:req.socket.remoteAddress,prior=attempts.get(ip);if(prior&&prior.count>=10&&Date.now()-prior.time<900000)fail(429,'Too many attempts. Try again in 15 minutes.');
const u=db.users.find(u=>u.email===email);
if(!u||typeof b.password!=='string'||!verify(b.password,u)||u.status!=='active'||(u.stationId&&db.stations.find(s=>s.id===u.stationId)?.status!=='active')){attempts.set(ip,{count:prior&&Date.now()-prior.time<900000?prior.count+1:1,time:prior?.time&&Date.now()-prior.time<900000?prior.time:Date.now()});fail(401,'Unable to sign in. Check your details or contact your administrator.');}
attempts.delete(ip);if(cloud)await cloud.clearLoginAttempts(email);const token=crypto.randomBytes(32).toString('hex');sessions.set(sessionKey(token),{userId:u.id,expires:Date.now()+28800000});if(cloud)await save();res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${runtime.cookieSuffix}`);return send(200,{user:clean(u)});}
const token=(req.headers.cookie||'').split('; ').find(c=>c.startsWith('session='))?.slice(8),session=sessions.get(sessionKey(token)),u=session&&session.expires>Date.now()?db.users.find(u=>u.id===session.userId):null;
if(route.startsWith('/api/')){
if(!u||u.status!=='active'||(u.stationId&&db.stations.find(s=>s.id===u.stationId)?.status!=='active'))fail(401,'Please sign in to continue.');
if(route==='/api/logout'){sessions.delete(sessionKey(token));if(cloud)await save();res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+runtime.cookieSuffix);return send(200,{ok:true});}
if(route==='/api/me')return send(200,{user:clean(u),station:db.stations.find(s=>s.id===u.stationId)||null});

ï»¿ï»¿ï»¿if(route==='/api/reconciliation-settings'){
 if(u.role!=='station_admin')fail(403,'Only Station Admins can configure reconciliation.');const station=db.stations.find(s=>s.id===u.stationId);if(req.method==='GET')return send(200,{frequency:station.reconciliationFrequency||'weekly'});const b=await body(req);if(!['daily','weekly','monthly'].includes(b.frequency))fail(400,'Choose daily, weekly or monthly.');const previous=station.reconciliationFrequency||'weekly';station.reconciliationFrequency=b.frequency;audit(u,'reconciliation_frequency_updated',station.id,{frequency:previous},{frequency:b.frequency});await save();return send(200,{frequency:b.frequency});
}
if(route==='/api/meter-reconciliations'||route.startsWith('/api/meter-reconciliations/')){
 if(u.role!=='station_admin')fail(403,'Only Station Admins can reconcile meter readings.');const recId=route.split('/')[3],action=route.split('/')[4],existing=recId?db.meterReconciliations.find(r=>r.id===recId&&r.stationId===u.stationId):null;if(recId&&!existing)fail(404,'Reconciliation not found.');if(req.method==='GET')return send(200,existing||db.meterReconciliations.filter(r=>r.stationId===u.stationId).slice().reverse());
 const b=await body(req),now=new Date().toISOString();const previous=existing?JSON.parse(JSON.stringify({...existing,revisions:undefined})):null;let record;
 if(action==='recheck'){record=existing;if(!record)fail(404,'Reconciliation not found.');}
 else{
 if(!['daily','weekly','monthly'].includes(b.frequency))fail(400,'Choose a valid frequency.');
 const from=Date.parse(b.from),to=Date.parse(b.to);if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)fail(400,'Enter valid starting and ending timestamps.');if(to>Date.now())fail(400,'The ending reading cannot be in the future.');if(to-from>32*86400000)fail(400,'Reconcile an interval of 32 days or less.');
 const machine=db.machines.find(m=>m.id===b.machineId&&m.stationId===u.stationId);if(!machine)fail(400,'Select a machine in your station.');
 const nozzles=db.nozzles.filter(n=>n.machineId===machine.id&&n.stationId===u.stationId);if(!nozzles.length)fail(400,'This machine has no nozzles.');if(!Array.isArray(b.readings)||b.readings.length!==nozzles.length||new Set(b.readings.map(n=>n.nozzleId)).size!==nozzles.length)fail(400,'Enter starting and ending readings for every nozzle.');
 const readings=nozzles.map(n=>{const input=b.readings.find(r=>r.nozzleId===n.id);if(!input)fail(400,'A nozzle reading is missing.');const opening=reconciliation.parseDecimal(input.opening,3,'starting meter reading'),closing=reconciliation.parseDecimal(input.closing,3,'ending meter reading');if(closing<opening)fail(400,'Ending reading cannot be lower than starting reading.');return {nozzleId:n.id,number:n.number,fuelName:db.fuels.find(f=>f.id===n.fuelId)?.name||'Fuel',opening,closing};});
 const fromIso=new Date(from).toISOString(),toIso=new Date(to).toISOString();if(db.meterReconciliations.some(r=>r.id!==recId&&r.stationId===u.stationId&&r.machineId===machine.id&&r.from===fromIso&&r.to===toIso))fail(409,'This machine already has a reconciliation for that exact interval. Open it to edit or recheck.');
 record=existing||{id:id(),stationId:u.stationId,createdAt:now,createdBy:u.id,revisions:[]};Object.assign(record,{machineId:machine.id,machineName:machine.name,from:fromIso,to:toIso,frequency:b.frequency,readings});
 }
 if(previous)record.revisions.push({...previous,archivedAt:now});record.results=meterComparison.compare(db,record);record.status=record.results.some(r=>r.status==='Incomplete')?'Incomplete':record.results.some(r=>r.status==='Mismatch')?'Mismatch':'Matched';record.checkedAt=now;record.checkedBy=u.id;record.revision=(record.revision||0)+1;if(!existing)db.meterReconciliations.push(record);audit(u,'meter_reconciliation_'+(action==='recheck'?'rechecked':existing?'corrected':'created'),record.id,previous,JSON.parse(JSON.stringify({...record,revisions:undefined})));await save();return send(existing?200:201,record);
}

if(route.startsWith('/api/evidence/')){
 const evidenceId=route.split('/')[3];const run=db.runs.find(r=>r.stationId===u.stationId&&(u.role==='station_admin'||(u.role==='salesman'&&r.salesmanId===u.id))&&r.readings.some(n=>[n.opening,n.closing].some(e=>e?.photoId===evidenceId)));
 if(!run)fail(404,'Photo not found.');const reading=run.readings.flatMap(n=>[n.opening,n.closing]).find(e=>e?.photoId===evidenceId);
 const bytes=cloud?await cloud.download(run.stationId,evidenceId):fs.readFileSync(path.join(path.dirname(file),'evidence',evidenceId));res.writeHead(200,{'Content-Type':reading.mime,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'"});return res.end(bytes);
}
if(route==='/api/runs'||route.startsWith('/api/runs/')){
 if(!['station_admin','salesman'].includes(u.role))fail(403,'Only station staff can access shift records.');
 const parts=route.split('/'),runId=parts[3],action=parts[4];
 const owns=r=>r.stationId===u.stationId&&(u.role==='station_admin'||r.salesmanId===u.id);
 if(req.method==='GET'){const rows=db.runs.filter(owns).map(r=>r.calculation?{...r,reconciliation:reconciliation.reconcile(r)}:r);if(runId){const r=rows.find(r=>r.id===runId);if(!r)fail(404,'Shift not found.');if(action==='reconciliation')return send(200,reconciliation.reconcile(r));return send(200,r);}return send(200,rows);}
 if(req.method!=='POST'||u.role!=='salesman')fail(403,'Only the assigned salesman can record a shift.');
 const b=await body(req);const now=new Date().toISOString();
 if(!runId){const assignment=db.assignments.find(a=>a.id===b.assignmentId&&a.stationId===u.stationId&&a.salesmanId===u.id&&a.status==='scheduled');if(!assignment)fail(404,'Assignment not found.');
 const prior=db.runs.find(r=>r.assignmentId===assignment.id);if(prior)return send(200,prior);
 if(assignment.endsAt<now)fail(400,'This scheduled shift has ended. Ask your Station Admin for a new assignment.');
 if(db.runs.some(r=>r.status!=='completed'&&(r.salesmanId===u.id||r.machineId===assignment.machineId)))fail(409,'You or this machine already have an unfinished shift.');
 if(!db.machines.some(m=>m.id===assignment.machineId&&m.status==='active'))fail(400,'This machine is inactive. Contact your Station Admin.');
 if(assignment.snapshot.nozzles.some(n=>!db.nozzles.some(x=>x.id===n.id&&x.status==='active')||!db.fuels.some(f=>f.id===n.fuelId&&f.status==='active')))fail(400,'The assigned nozzles or fuel types are inactive. Contact your Station Admin.');
 const run={id:id(),stationId:u.stationId,salesmanId:u.id,machineId:assignment.machineId,assignmentId:assignment.id,snapshot:JSON.parse(JSON.stringify(assignment.snapshot)),status:'opening',createdAt:now,readings:assignment.snapshot.nozzles.map(n=>({nozzleId:n.id,number:n.number,fuelId:n.fuelId,fuelName:n.fuelName}))};db.runs.push(run);audit(u,'shift_opening_started',run.id,null,JSON.parse(JSON.stringify(run)));await save();return send(201,run);}
 const run=db.runs.find(r=>r.id===runId&&owns(r));if(!run)fail(404,'Shift not found.');
 if(run.status==='completed'){if(action==='submit')return send(200,run);fail(403,'Completed shifts cannot be changed.');}
 const beforeRun=JSON.parse(JSON.stringify(run));
 const decimal=reconciliation.parseDecimal;
 if(action==='reading'){
 const stage=run.status==='opening'?'opening':run.status==='closing'?'closing':null;if(!stage)fail(400,'Readings cannot be changed at this step.');const reading=run.readings.find(n=>n.nozzleId===b.nozzleId);if(!reading)fail(400,'Select a nozzle belonging to this shift.');const value=decimal(b.value,3,'meter reading');if(stage==='closing'&&value<reading.opening.value)fail(400,'Closing reading cannot be lower than opening reading.');
 let photo=reading[stage];if(b.photo){const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(b.photo);if(!match)fail(400,'Use a JPEG or PNG photo.');const bytes=Buffer.from(match[2],'base64');if(bytes.length>3*1024*1024||bytes.length<24)fail(400,'Use a photo smaller than 3 MB.');if(match[1]==='jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))fail(400,'Invalid JPEG photo.');if(match[1]==='png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail(400,'Invalid PNG photo.');const photoId=id();if(cloud)await cloud.upload(run.stationId,photoId,bytes,'image/'+match[1]);else{const folder=path.join(path.dirname(file),'evidence');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,photoId),bytes);}photo={photoId,mime:'image/'+match[1]};}
 if(!photo?.photoId)fail(400,'Add a reading photo before continuing.');reading[stage]={value,photoId:photo.photoId,mime:photo.mime,recordedAt:now};audit(u,stage+'_reading_saved',run.id,beforeRun,JSON.parse(JSON.stringify(run)));await save();return send(200,run);
 }
 if(action==='activate'){
 if(run.status!=='opening'||run.readings.some(n=>!n.opening?.photoId))fail(400,'Every nozzle needs an opening reading and photo.');
 const rates=run.readings.map(n=>db.rates.filter(r=>r.fuelId===n.fuelId&&r.stationId===u.stationId&&r.effectiveAt<=now).sort((a,b)=>b.effectiveAt.localeCompare(a.effectiveAt))[0]);if(rates.some(r=>!r))fail(400,'A fuel rate is missing. Contact your Station Admin.');run.readings.forEach((n,i)=>{n.rateMinor=rates[i].amountMinor;n.rateId=rates[i].id;});run.startedAt=now;run.status='active';
 }else if(action==='end'){
 if(run.status!=='active')fail(400,'Only an active shift can be ended.');run.endedAt=now;run.status='closing';
 }else if(action==='review'){
 if(run.status!=='closing'||run.readings.some(n=>!n.closing?.photoId))fail(400,'Every nozzle needs a closing reading and photo.');const cashMinor=decimal(b.cash,2,'cash handover');run.calculation=reconciliation.calculate(run.readings,cashMinor);run.status='review';
 }else if(action==='revise'){
 if(run.status!=='review')fail(400,'Only a shift under review can be revised.');run.status='closing';delete run.calculation;
 }else if(action==='submit'){
 if(run.status!=='review'||!run.calculation)fail(400,'Review the shift before submitting it.');if(!reconciliation.reconcile(run).matches)fail(409,'Shift totals could not be verified. Return to review before submitting.');run.status='completed';run.completedAt=now;const assignment=db.assignments.find(a=>a.id===run.assignmentId);if(assignment)assignment.status='completed';
 }else fail(404,'Shift action not found.');
 audit(u,'shift_'+action,run.id,beforeRun,JSON.parse(JSON.stringify(run)));await save();return send(200,run);
}

if(route.startsWith('/api/config/')){
 const parts=route.split('/'),kind=parts[3],recordId=parts[4];
 const kinds=['fuels','rates','machines','nozzles','shifts','assignments','salesmen'];
 if(!kinds.includes(kind))fail(404,'Page not found.');
 if(u.role!=='station_admin'&&!(u.role==='salesman'&&kind==='assignments'&&req.method==='GET'))fail(403,'Only your Station Admin can manage station setup.');
 const collection=kind==='salesmen'?db.users:db[kind];
 const scoped=()=>collection.filter(r=>r.stationId===u.stationId&&(kind!=='salesmen'||r.role==='salesman')&&(u.role!=='salesman'||r.salesmanId===u.id));
 const existing=recordId?scoped().find(r=>r.id===recordId):null;
 if(recordId&&!existing)fail(404,'Record not found in your station.');
 if(req.method==='GET')return send(200,existing?(kind==='salesmen'?clean(existing):existing):scoped().map(r=>kind==='salesmen'?clean(r):r));
 if(req.method!=='POST'||u.role!=='station_admin')fail(405,'This action is not supported.');
 const b=await body(req),now=new Date().toISOString();
 const text=(key,label)=>{if(typeof b[key]!=='string'||!b[key].trim()||b[key].length>150)fail(400,`Enter ${label} (up to 150 characters).`);return b[key].trim();};
 const status=()=>{if(!['active','inactive'].includes(b.status))fail(400,'Choose an active or inactive status.');return b.status;};
 const ref=(type,key)=>{const r=db[type].find(r=>r.id===b[key]&&r.stationId===u.stationId&&r.status==='active'&&(type!=='users'||r.role==='salesman'));if(!r)fail(400,'Select an active record belonging to your station.');return r;};
 const unique=(key,value)=>{if(scoped().some(r=>r.id!==recordId&&String(r[key]).toLowerCase()===value.toLowerCase()))fail(409,'That name or identifier is already used in your station.');};
 const rateValue=()=>{if(!/^\d+(\.\d{1,2})?$/.test(String(b.amount))||Number(b.amount)<=0||Number(b.amount)>1000000)fail(400,'Enter a positive fuel rate with at most two decimal places.');return reconciliation.parseDecimal(b.amount,2,'fuel rate');};
 const futureAssignments=()=>db.assignments.filter(a=>a.stationId===u.stationId&&a.status==='scheduled'&&a.endsAt>now);
 const ensureUnassigned=(key,value)=>{if(futureAssignments().some(a=>a[key]===value)||db.runs.some(r=>r.status!=='completed'&&(key==='shiftId'?db.assignments.find(a=>a.id===r.assignmentId)?.shiftId===value:r[key]===value)))fail(409,'Cancel the upcoming assignment before deactivating this record.');};
 let values,extraRate;
 if(kind==='fuels'){
 const name=text('name','a fuel name');unique('name',name);values={name,status:status()};
 if(existing&&values.status==='inactive'&&(futureAssignments().some(a=>a.snapshot.nozzles.some(n=>n.fuelId===existing.id))||db.runs.some(r=>r.status!=='completed'&&r.readings.some(n=>n.fuelId===existing.id))))fail(409,'Cancel upcoming assignments using this fuel before deactivating it.');
 if(!existing){const amountMinor=rateValue();if(b.effectiveAt&&!Number.isFinite(Date.parse(b.effectiveAt)))fail(400,'Enter a valid effective date and time.');const effectiveAt=b.effectiveAt?new Date(b.effectiveAt).toISOString():now;extraRate={id:id(),stationId:u.stationId,amountMinor,effectiveAt,createdAt:now,createdBy:u.id};}
 }
 if(kind==='rates'){
 if(existing)fail(403,'Historical rates cannot be edited. Add a new rate instead.');ref('fuels','fuelId');const amountMinor=rateValue();const stamp=Date.parse(b.effectiveAt);if(!Number.isFinite(stamp))fail(400,'Enter a valid effective date and time.');const effectiveAt=new Date(stamp).toISOString();
 if(stamp<Date.now()-60000)fail(400,'New rates must take effect now or in the future. Historical rates cannot be changed.');
 if(db.rates.some(r=>r.fuelId===b.fuelId&&r.effectiveAt===effectiveAt))fail(409,'A rate already exists at that time.');
 values={fuelId:b.fuelId,amountMinor,effectiveAt};
 }
 if(kind==='machines'){
 const name=text('name','a machine name'),code=text('code','a machine ID');unique('code',code);values={name,code,status:status()};if(existing&&values.status==='inactive')ensureUnassigned('machineId',existing.id);
 }
 if(kind==='nozzles'){
 ref('machines','machineId');ref('fuels','fuelId');const number=text('number','a nozzle number');if(scoped().some(n=>n.id!==recordId&&n.machineId===b.machineId&&n.number.toLowerCase()===number.toLowerCase()))fail(409,'That nozzle number is already used on this machine.');
 if(existing&&(futureAssignments().some(a=>a.snapshot.nozzles.some(n=>n.id===existing.id))||db.runs.some(r=>r.status!=='completed'&&r.readings.some(n=>n.nozzleId===existing.id))))fail(409,'Cancel upcoming assignments before changing this nozzle.');
 values={machineId:b.machineId,fuelId:b.fuelId,number,status:status()};
 }
 if(kind==='shifts'){
 const name=text('name','a shift name');unique('name',name);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.endTime)||b.startTime===b.endTime)fail(400,'Enter different start and end times in 24-hour format.');values={name,startTime:b.startTime,endTime:b.endTime,status:status()};if(existing&&values.status==='inactive')ensureUnassigned('shiftId',existing.id);
 }
 if(kind==='salesmen'){
 const name=text('name','a full name'),employeeId=text('employeeId','an employee ID');unique('employeeId',employeeId);const email=text('email','an email address').toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))fail(400,'Enter a valid email address.');if(db.users.some(r=>r.id!==recordId&&r.email===email))fail(409,'This email already has an account.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.joiningDate)||!Number.isFinite(Date.parse(b.joiningDate))||new Date(b.joiningDate).toISOString().slice(0,10)!==b.joiningDate)fail(400,'Enter a valid joining date.');
 values={name,email,employeeId,phone:text('phone','a phone number'),joiningDate:b.joiningDate,status:status(),role:'salesman'};
 if(!existing){if(typeof b.password!=='string'||b.password.length<12)fail(400,'Use a password of at least 12 characters.');Object.assign(values,password(b.password));}
 if(existing&&values.status==='inactive')ensureUnassigned('salesmanId',existing.id);
 }
 if(kind==='assignments'){
 if(existing){if(db.runs.some(r=>r.assignmentId===existing.id))fail(409,'This assignment already has a shift record and cannot be cancelled.');if(b.action!=='cancel'||existing.status!=='scheduled')fail(400,'Only a scheduled assignment can be cancelled.');values={status:'cancelled',cancelledAt:now};}
 else{
 const salesman=ref('users','salesmanId'),machine=ref('machines','machineId'),shift=ref('shifts','shiftId');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||new Date(b.date).toISOString().slice(0,10)!==b.date)fail(400,'Enter a valid shift date.');
 // The original brief uses rupees; station scheduling currently uses Pakistan time explicitly.
 const startsAt=new Date(b.date+'T'+shift.startTime+':00+05:00').toISOString();let end=new Date(b.date+'T'+shift.endTime+':00+05:00');if(shift.endTime<shift.startTime)end=new Date(end.getTime()+86400000);const endsAt=end.toISOString();
 if(startsAt<now)fail(400,'Choose a shift that starts in the future.');
 if(db.assignments.some(a=>a.stationId===u.stationId&&a.status==='scheduled'&&a.startsAt<endsAt&&a.endsAt>startsAt&&(a.salesmanId===salesman.id||a.machineId===machine.id)))fail(409,'The salesman or machine already has an overlapping assignment.');
 const nozzles=db.nozzles.filter(n=>n.stationId===u.stationId&&n.machineId===machine.id&&n.status==='active');if(!nozzles.length)fail(400,'Add an active nozzle to this machine first.');
 if(nozzles.some(n=>!db.fuels.some(f=>f.id===n.fuelId&&f.status==='active')||!db.rates.some(r=>r.fuelId===n.fuelId&&r.effectiveAt<=startsAt)))fail(400,'Every nozzle needs an active fuel type and a rate effective by shift start.');
 values={salesmanId:salesman.id,machineId:machine.id,shiftId:shift.id,date:b.date,startsAt,endsAt,status:'scheduled',snapshot:{salesmanName:salesman.name,employeeId:salesman.employeeId||'',machineName:machine.name,machineCode:machine.code,shiftName:shift.name,startTime:shift.startTime,endTime:shift.endTime,nozzles:nozzles.map(n=>({...n,fuelName:db.fuels.find(f=>f.id===n.fuelId).name}))}};
 }
 }
 const previous=existing?JSON.parse(JSON.stringify(kind==='salesmen'?clean(existing):existing)):null;
 const record=existing||{id:id(),stationId:u.stationId,createdAt:now,createdBy:u.id};Object.assign(record,values);if(!existing)collection.push(record);
 if(extraRate)db.rates.push({...extraRate,fuelId:record.id});
 if(kind==='salesmen'&&record.status==='inactive')for(const [token,session] of sessions)if(session.userId===record.id)sessions.delete(token);
 audit(u,kind+(existing?'_updated':'_created'),record.id,previous,JSON.parse(JSON.stringify(kind==='salesmen'?clean(record):record)));await save();return send(existing?200:201,kind==='salesmen'?clean(record):record);
}

if(['/api/reports','/api/reports/export','/api/audit'].includes(route)){if(u.role!=='station_admin')fail(403,'Only Station Admins can access reports.');if(req.method!=='GET')fail(405,'This action is not supported.');if(route==='/api/audit')return send(200,reporting.auditReport(db,u.stationId,url.searchParams));const report=reporting.reports(db,u.stationId,url.searchParams);if(route==='/api/reports/export'){const excel=url.searchParams.get('format')==='xlsx';res.writeHead(200,{'Content-Type':excel?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="shift-report-'+report.from+'-to-'+report.to+(excel?'.xlsx':'.csv')+'"'});return res.end(excel?excelExport.xlsx(reporting.cells(report)):reporting.csv(reporting.cells(report)));}return send(200,report);}
if(route==='/api/analytics'){if(u.role!=='station_admin')fail(403,'Only Station Admins can view station analytics.');if(req.method!=='GET')fail(405,'This action is not supported.');const report=reporting.reports(db,u.stationId,url.searchParams);const span=Math.round((Date.parse(report.to)-Date.parse(report.from))/86400000)+1;if(span>366)fail(400,'Choose a date range of up to 366 days.');const daily=Array.from({length:span},(_,i)=>({date:new Date(Date.parse(report.from)+i*86400000).toISOString().slice(0,10),fuelMilli:0,revenueMinor:0,shifts:0}));const byDay=new Map(daily.map(d=>[d.date,d]));for(const row of report.rows){const d=byDay.get(row.date);d.fuelMilli+=row.fuelMilli;d.revenueMinor+=row.expectedMinor;d.shifts++;}return send(200,{...report,daily,kpis:{completedShifts:report.rows.length,averageShiftRevenueMinor:report.rows.length?Math.round(report.totals.expectedMinor/report.rows.length):0,averagePriceMinor:report.totals.fuelMilli?Math.round(report.totals.expectedMinor*1000/report.totals.fuelMilli):0,collectionPercent:report.totals.expectedMinor?report.totals.cashMinor/report.totals.expectedMinor*100:null,shortageMinor:report.rows.reduce((s,r)=>s+Math.max(0,-r.varianceMinor),0),excessMinor:report.rows.reduce((s,r)=>s+Math.max(0,r.varianceMinor),0)}});}
if(route==='/api/station-dashboard'){if(u.role!=='station_admin')fail(403,'Only your Station Admin can view operations.');if(req.method!=='GET')fail(405,'This action is not supported.');return send(200,operationsDashboard.dashboard(db,u.stationId,new Date(),photoId=>cloud?Boolean(photoId):fs.existsSync(path.join(path.dirname(file),'evidence',photoId))));}
if(route==='/api/dashboard'){
if(u.role!=='super_admin')fail(403,'Only the Super Admin can view platform totals.');
return send(200,{totalStations:db.stations.length,activeStations:db.stations.filter(s=>s.status==='active').length,inactiveStations:db.stations.filter(s=>s.status==='inactive').length,totalAdmins:db.users.filter(v=>v.role==='station_admin').length,totalSalesmen:db.users.filter(v=>v.role==='salesman').length,recent:db.stations.slice(-5).reverse()});}
if(route==='/api/stations'||route.startsWith('/api/stations/')){
if(u.role!=='super_admin')fail(403,'Only the Super Admin can manage stations.');
const stationId=route.split('/')[3],existing=stationId?db.stations.find(s=>s.id===stationId):null;
if(stationId&&!existing)fail(404,'Station not found.');
if(req.method==='GET'){if(existing)return send(200,{...existing,createdByName:db.users.find(v=>v.id===existing.createdBy)?.name||'Unknown',admins:db.users.filter(v=>v.stationId===existing.id&&v.role==='station_admin').map(clean),salesmen:db.users.filter(v=>v.stationId===existing.id&&v.role==='salesman').length});const q=(url.searchParams.get('q')||'').toLowerCase();return send(200,db.stations.filter(s=>[s.name,s.city,s.owner,s.email].some(v=>(v||'').toLowerCase().includes(q))));}
if(req.method==='POST'){
const b=await body(req);for(const key of ['name','owner','city'])if(typeof b[key]!=='string'||!b[key].trim()||b[key].length>200)fail(400,'Station name, owner, and city are required (maximum 200 characters).');
for(const key of ['address','phone','email'])if(b[key]!==undefined&&(typeof b[key]!=='string'||b[key].length>500))fail(400,'Contact details are invalid.');
if(b.email&&!/^\S+@\S+\.\S+$/.test(b.email))fail(400,'Enter a valid email address.');
if(!['active','inactive'].includes(b.status||'active'))fail(400,'Choose an active or inactive status.');
const previous=existing?{...existing}:null;
const values={name:b.name.trim(),owner:b.owner.trim(),city:b.city.trim(),address:b.address||'',phone:b.phone||'',email:b.email||'',status:b.status||'active'};
const station=existing||{id:id(),createdAt:new Date().toISOString(),createdBy:u.id};Object.assign(station,values);if(!existing)db.stations.push(station);
if(station.status==='inactive')for(const [token,session] of sessions)if(db.users.find(v=>v.id===session.userId)?.stationId===station.id)sessions.delete(token);
audit(u,existing?'station_updated':'station_created',station.id,previous,{...station});await save();return send(existing?200:201,station);}
fail(405,'This action is not supported.');}
if(route.startsWith('/api/users/')){
if(u.role!=='super_admin')fail(403,'Only the Super Admin can update Station Admins.');
const target=db.users.find(v=>v.id===route.split('/')[3]&&v.role==='station_admin');if(!target)fail(404,'Station Admin not found.');if(req.method!=='POST')fail(405,'This action is not supported.');
const b=await body(req);if(typeof b.name!=='string'||!b.name.trim()||typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email)||!['active','inactive'].includes(b.status))fail(400,'Enter a name, valid email and status.');
const email=b.email.trim().toLowerCase();if(db.users.some(v=>v.id!==target.id&&v.email===email))fail(409,'This email already has an account.');
if(b.stationId!==target.stationId)fail(400,'Station assignments cannot be changed here. Create an account at the correct station.');
const previous=clean(target);Object.assign(target,{name:b.name.trim(),email,phone:String(b.phone||''),status:b.status});
if(target.status==='inactive')for(const [token,session] of sessions)if(session.userId===target.id)sessions.delete(token);
audit(u,'station_admin_updated',target.id,previous,clean(target));await save();return send(200,clean(target));}
if(route==='/api/users'){if(u.role==='salesman')fail(403,'You cannot manage accounts.');if(req.method==='GET')return send(200,db.users.filter(v=>u.role==='super_admin'?v.role==='station_admin':v.stationId===u.stationId&&v.role==='salesman').map(clean));if(req.method==='POST'){const b=await body(req),stationId=u.role==='super_admin'?b.stationId:u.stationId;if(!db.stations.some(s=>s.id===stationId&&s.status==='active'))fail(400,'Select an active station.');const created=addUser(b,u.role==='super_admin'?'station_admin':'salesman',stationId);audit(u,'account_created',created.id);await save();return send(201,clean(created));}}
if(route==='/api/assignments'){if(u.role!=='salesman')fail(403,'This page is for salesmen.');return send(200,db.assignments.filter(a=>a.stationId===u.stationId&&a.salesmanId===u.id));}
fail(404,'Page not found.');}
if(route==='/'&&req.method==='GET'){const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const script=html.match(/<script>([\s\S]*)<\/script>/)[1];const hash=crypto.createHash('sha256').update(script.replace(/\r\n?/g,'\n')).digest('base64');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'sha256-"+hash+"'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'index.html')));}
fail(404,'Page not found.');
 }catch(e){if(beforeMutation)db=JSON.parse(beforeMutation);send(e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});}}
let mutationQueue=Promise.resolve();
const server=http.createServer((req,res)=>{if(req.method==='GET'&&!cloud)handle(req,res);else {mutationQueue=mutationQueue.then(()=>handle(req,res)).catch(()=>{if(!res.writableEnded){res.writeHead(500);res.end('Unable to save this request.');}});}});
server.requestTimeout=15000;server.headersTimeout=15000;
const cleanup=setInterval(()=>{const now=Date.now();for(const [key,value]of sessions)if(value.expires<=now)sessions.delete(key);for(const[key,value]of attempts)if(now-value.time>=900000)attempts.delete(key);},60000);cleanup.unref();
if(require.main===module)server.listen(runtime.port,runtime.bind,()=>console.log('Fuel portal ready at '+(runtime.origin||'http://127.0.0.1:'+runtime.port)));
module.exports={server};

