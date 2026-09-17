const collections=['users','stations','audit','fuels','rates','machines','nozzles','shifts','assignments','runs','meterReconciliations'];
class SupabaseStore {
 constructor(env=process.env, transport=fetch) {
  const url=new URL(env.SUPABASE_URL);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('SUPABASE_URL must be an HTTPS origin.');
  if(!env.SUPABASE_SECRET_KEY)throw Error('Set the server-only SUPABASE_SECRET_KEY.');
  const key=env.SUPABASE_SECRET_KEY;let privileged=key.startsWith('sb_secret_');
  if(!privileged){try{privileged=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='service_role';}catch{}}
  if(!privileged)throw Error('Use a server secret key, never a publishable or anon key.');
  this.url=url.origin;this.key=env.SUPABASE_SECRET_KEY;this.transport=transport;
  this.bucket='portal-evidence';
 }
 async request(route,options={}) {
  const headers={apikey:this.key,...(this.key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+this.key}),...options.headers};
  let response;
  try{response=await this.transport(this.url+route,{...options,headers,signal:AbortSignal.timeout(12000)});}catch{throw Object.assign(Error('Cloud storage is unavailable. Please try again.'),{status:503});}
  if(!response.ok){
   const detail=await response.text();
   if(detail.includes('PORTAL_CONFLICT'))throw Object.assign(Error('Another request updated these records. Refresh and try again.'),{status:409});
   throw Object.assign(Error('Cloud storage request failed. Please contact your administrator.'),{status:503});
  }
  return response;
 }
 async rpc(name,body={}){const response=await this.request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await response.text();return text?JSON.parse(text):null;}
 async loginAttempt(email){const identity_key=require('node:crypto').createHash('sha256').update(email).digest('hex');return this.rpc('portal_login_attempt',{identity_key});}
 async clearLoginAttempts(email){const identity_key=require('node:crypto').createHash('sha256').update(email).digest('hex');await this.rpc('portal_login_clear',{identity_key});}
 async load(){const state=await this.rpc('portal_load');if(!state||!Number.isSafeInteger(state.revision)||!state.db||collections.some(k=>!Array.isArray(state.db[k]))||!Array.isArray(state.sessions))throw Object.assign(Error('Cloud database is not initialized correctly.'),{status:503});return state;}
 async save(db,sessions,revision){return this.rpc('portal_save',{expected_revision:revision,document:db,session_records:[...sessions].filter(([,v])=>v.expires>Date.now())});}
 evidencePath(stationId,id){if(!/^[0-9a-f-]{36}$/i.test(stationId)||!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid evidence identifier.');return this.bucket+'/'+stationId+'/'+id;}
 async upload(stationId,id,bytes,mime){await this.request('/storage/v1/object/'+this.evidencePath(stationId,id),{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});}
 async download(stationId,id){const res=await this.request('/storage/v1/object/authenticated/'+this.evidencePath(stationId,id));return Buffer.from(await res.arrayBuffer());}
 async createBucket(){
  // A bucket with this name must either be absent or have matching private settings.
  const all=await (await this.request('/storage/v1/bucket')).json();const existing=all.find(b=>b.id===this.bucket);
  if(existing){if(existing.public||Number(existing.file_size_limit)!==3145728)throw Error('Existing evidence bucket settings need review.');return;}
  await this.request('/storage/v1/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:this.bucket,name:this.bucket,public:false,file_size_limit:3145728,allowed_mime_types:['image/jpeg','image/png']})});
 }
}
module.exports={SupabaseStore,collections};
