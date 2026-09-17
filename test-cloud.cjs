const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {SupabaseStore,collections}=require('./supabase-store.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const clone=x=>JSON.parse(JSON.stringify(x));
let state={revision:0,db:Object.fromEntries(collections.map(k=>[k,[]])),sessions:[]},conflict=false,unavailable=false;
const photos=new Map();const nativeFetch=global.fetch;
const password='CloudTest2026!Long',salt='test-salt';
state.db.users.push({id:crypto.randomUUID(),name:'Owner',email:'owner@example.test',role:'super_admin',stationId:null,status:'active',salt,hash:crypto.scryptSync(password,salt,64).toString('hex')});
process.env.SUPABASE_URL='https://portal-test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_only';process.env.NODE_ENV='development';
global.fetch=async(url,options={})=>{
 if(!url.startsWith(process.env.SUPABASE_URL))return nativeFetch(url,options);
 if(unavailable)throw Error('private upstream detail');
 eq(options.headers.apikey,'sb_secret_test_only');eq(options.headers.Authorization,undefined);
 if(url.endsWith('/rpc/portal_login_attempt'))return Response.json(true);if(url.endsWith('/rpc/portal_login_clear'))return new Response(null,{status:204});
 if(url.endsWith('/rpc/portal_load'))return Response.json(clone(state));
 if(url.endsWith('/rpc/portal_save')){const b=JSON.parse(options.body);if(conflict||b.expected_revision!==state.revision){conflict=false;return Response.json({message:'PORTAL_CONFLICT'},{status:400});}state={revision:state.revision+1,db:clone(b.document),sessions:clone(b.session_records)};return Response.json(state.revision);}
 if(url.includes('/storage/v1/object/')){const path=url.split('/storage/v1/object/')[1].replace(/^authenticated\//,'');if(options.method==='POST'){photos.set(path,Buffer.from(options.body));return Response.json({Key:path});}return new Response(photos.get(path)||'',{status:photos.has(path)?200:404});}
 throw Error('Unexpected request');
};
let server,base;
async function start(){delete require.cache[require.resolve('./server.cjs')];server=require('./server.cjs').server;await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;}
async function call(route,body,cookie){const response=await nativeFetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
(async()=>{try{
 assert.throws(()=>new SupabaseStore({SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:'sb_publishable_example'}));checks++;
 await start();eq((await call('health')).body.storage,'supabase');eq((await call('stations')).status,401);
 const login=await call('login',{email:'owner@example.test',password});eq(login.status,200);const owner=login.cookie;
 eq(state.sessions.length,1);eq(state.sessions[0][0],crypto.createHash('sha256').update(owner.split('=')[1]).digest('hex'));
 const station=(await call('stations',{name:'Cloud A',city:'Karachi',owner:'Owner'},owner)).body;
 const other=(await call('stations',{name:'Cloud B',city:'Karachi',owner:'Owner'},owner)).body;
 eq(state.db.stations.length,2);
 eq((await call('users',{name:'Admin A',email:'a@example.test',password,stationId:station.id},owner)).status,201);
 eq((await call('users',{name:'Admin B',email:'b@example.test',password,stationId:other.id},owner)).status,201);
 const a=(await call('login',{email:'a@example.test',password})).cookie,b=(await call('login',{email:'b@example.test',password})).cookie;
 eq((await call('users',{name:'Worker',email:'worker@example.test',password,stationId:other.id},a)).body.stationId,station.id);
 eq((await call('users',null,b)).body.length,0);
 conflict=true;eq((await call('stations',{name:'Do not save',city:'Karachi',owner:'Owner'},owner)).status,409);eq(state.db.stations.length,2);
 unavailable=true;const failure=await call('stations',null,owner);eq(failure.status,503);eq(JSON.stringify(failure.body).includes('private upstream'),false);unavailable=false;
 await new Promise(r=>server.close(r));await start();eq((await call('me',null,owner)).status,200);
 eq((await call('logout',{},owner)).status,200);eq((await call('me',null,owner)).status,401);
 const adapter=new SupabaseStore();const photoId=crypto.randomUUID();await adapter.upload(station.id,photoId,Buffer.from('test-photo'),'image/png');eq((await adapter.download(station.id,photoId)).toString(),'test-photo');
 assert.throws(()=>adapter.evidencePath('../invalid',photoId));checks++;
 console.log(checks+' cloud checks passed: server-only credentials, saved sessions, station isolation, conflict rejection, failure handling and private evidence.');
 }finally{if(server)await new Promise(r=>server.close(r));global.fetch=nativeFetch;}
})().catch(e=>{console.error(e);process.exitCode=1;});
