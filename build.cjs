const fs=require('fs'),path=require('path');const {spawnSync}=require('child_process');
for(const filename of fs.readdirSync(__dirname).filter(f=>f.endsWith('.cjs'))){const result=spawnSync(process.execPath,['--preserve-symlinks-main','--preserve-symlinks','--check',path.join(__dirname,filename)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
console.log('Server and browser scripts validated. No compilation is required.');
