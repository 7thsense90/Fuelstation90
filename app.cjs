// Hostinger imports its entry file. Start listening even when loaded with require().
const {server}=require('./server.cjs');
const runtime=require('./runtime.cjs').configuration();
server.listen(runtime.port,runtime.bind,()=>console.log('Fuel portal ready at '+(runtime.origin||'http://127.0.0.1:'+runtime.port)));
