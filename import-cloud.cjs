// Run with: node --env-file=.env import-cloud.cjs PATH_TO_LOCAL_DATA
// Never place .env or local records in Git. Import only into an empty cloud database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SupabaseStore,collections}=require('./supabase-store.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function migrate(source,store=new SupabaseStore()){
 const file=path.join(source,'store.json'),bytes=fs.readFileSync(file),db=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 for(const kind of collections)db[kind] ||= [];
 if(!db.users.some(u=>u.role==='super_admin'&&u.status==='active'))throw Error('The source must contain an active Super Admin.');
 const before=await store.load();if(before.revision!==0||collections.some(k=>before.db[k].length))throw Error('Cloud destination is not empty. Import stopped without overwriting it.');
 await store.createBucket();
 const evidence=new Map();
 for(const run of db.runs)for(const reading of run.readings||[])for(const item of [reading.opening,reading.closing])if(item?.photoId){
  store.evidencePath(run.stationId,item.photoId);
  evidence.set(run.stationId+'/'+item.photoId,{stationId:run.stationId,id:item.photoId,mime:item.mime});
 }
 for(const item of evidence.values()){
  const photo=fs.readFileSync(path.join(source,'evidence',item.id));
  try{await store.upload(item.stationId,item.id,photo,item.mime);}catch(error){
   // Resume an interrupted import only when the existing private object is byte-identical.
   let existing;try{existing=await store.download(item.stationId,item.id);}catch{throw error;}
   if(digest(existing)!==digest(photo))throw Error('Existing cloud evidence differs. Import stopped.');
  }
  if(digest(await store.download(item.stationId,item.id))!==digest(photo))throw Error('Cloud evidence verification failed.');
 }
 if(digest(fs.readFileSync(file))!==digest(bytes))throw Error('Local data changed during import. Stop local writes and retry.');
 await store.save(db,new Map(),before.revision);
 const after=await store.load();
 for(const kind of collections){
  const actual=new Map(after.db[kind].map(record=>[record.id,record]));
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  if(actual.size!==db[kind].length||db[kind].some(record=>JSON.stringify(stable(actual.get(record.id)))!==JSON.stringify(stable(record))))throw Error('Cloud verification failed for '+kind+'. Do not switch traffic.');
 }
 return {collections:Object.fromEntries(collections.map(k=>[k,db[k].length])),verifiedPhotos:evidence.size,revision:after.revision};
}
if(require.main===module)migrate(path.resolve(process.argv[2]||'data')).then(report=>console.log(JSON.stringify(report,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={migrate};
