const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {configuration}=require('./runtime.cjs');
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
for(const env of [{NODE_ENV:'production'},{NODE_ENV:'production',PUBLIC_ORIGIN:'https://portal.example.test'},{PUBLIC_ORIGIN:'http://portal.example.test'},{PUBLIC_ORIGIN:'https://portal.example.test/path'},{PORT:'invalid'}]){assert.throws(()=>configuration(env));checks++;}
eq(configuration({}).acceptsHost('evil.example'),false);
eq(configuration({}).acceptsHost('localhost:4310'),true);
process.env.NODE_ENV='production';process.env.PUBLIC_ORIGIN='https://portal.example.test';
process.env.FUEL_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'fuel-hosting-test-'));
const salt=crypto.randomBytes(16).toString('hex'),password='TestingHosting2026!';
fs.writeFileSync(path.join(process.env.FUEL_DATA_DIR,'store.json'),JSON.stringify({users:[{id:'test-owner',name:'Test',email:'owner@example.test',role:'super_admin',status:'active',salt,hash:crypto.scryptSync(password,salt,64).toString('hex')}],stations:[],audit:[]}));
const {server}=require('./server.cjs');
const call=(route,data,headers={})=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:data?'POST':'GET',headers:{Host:'portal.example.test',...(data?{'Content-Type':'application/json'}:{}),...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(text)}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 eq((await call('/api/health')).status,200);
 eq((await call('/api/health',null,{Host:'evil.example'})).status,403);
 eq((await call('/api/login',{email:'owner@example.test',password},{Origin:'https://evil.example','X-Forwarded-Host':'portal.example.test'})).status,403);
 eq((await call('/api/login',{email:'owner@example.test',password},{Origin:'http://portal.example.test'})).status,403);
 eq((await call('/api/setup',{})).status,403);
 const login=await call('/api/login',{email:'owner@example.test',password},{Origin:'https://portal.example.test'});
 eq(login.status,200);eq(login.headers['set-cookie'][0].includes('; Secure'),true);eq(login.headers['strict-transport-security'],'max-age=31536000');
 const logout=await call('/api/logout',{}, {Cookie:login.headers['set-cookie'][0].split(';')[0]});
 eq(logout.status,200);eq(logout.headers['set-cookie'][0].includes('; Secure'),true);
 console.log(checks+' deployment configuration and HTTP checks passed.');
}finally{await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
