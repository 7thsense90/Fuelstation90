'use strict';
function invalid(message){throw Object.assign(new Error(message),{status:400});}
function safe(value,label){if(!Number.isSafeInteger(value)||value<0)invalid('Invalid '+label+'.');return value;}
function parseDecimal(value,places,label='amount'){
 const text=String(value);if(text.length>30||!new RegExp('^\\d+(\\.\\d{1,'+places+'})?$').test(text))invalid('Enter a valid '+label+' with up to '+places+' decimal places.');
 const [whole,fraction='']=text.split('.');const integer=BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));if(integer>1000000000000n)invalid(label+' is too large.');return Number(integer);
}
function calculate(readings,cashMinor){
 safe(cashMinor,'cash handover');if(!Array.isArray(readings)||!readings.length)invalid('No nozzle readings were recorded.');
 const seen=new Set(),fuelMap=new Map();let volumeTotal=0n,expectedTotal=0n;
 const sales=readings.map(n=>{
 if(!n.nozzleId||seen.has(n.nozzleId)||!n.fuelId)invalid('Invalid or repeated nozzle.');seen.add(n.nozzleId);
 const opening=safe(n.opening?.value,'opening reading'),closing=safe(n.closing?.value,'closing reading'),rate=safe(n.rateMinor,'fuel rate');if(rate===0)invalid('Fuel rate must be greater than zero.');if(closing<opening)invalid('Closing reading cannot be lower than opening reading.');
 const volumeMilli=closing-opening,expectedBig=(BigInt(volumeMilli)*BigInt(rate)+500n)/1000n;
 if(expectedBig>BigInt(Number.MAX_SAFE_INTEGER))invalid('Calculated sale is too large.');
 const expectedMinor=Number(expectedBig);volumeTotal+=BigInt(volumeMilli);expectedTotal+=expectedBig;
 const group=fuelMap.get(n.fuelId)||{fuelId:n.fuelId,fuelName:n.fuelName||'Fuel',volumeMilli:0,expectedMinor:0,nozzleCount:0};group.volumeMilli+=volumeMilli;group.expectedMinor+=expectedMinor;group.nozzleCount++;fuelMap.set(n.fuelId,group);
 return {nozzleId:n.nozzleId,fuelId:n.fuelId,volumeMilli,rateMinor:rate,expectedMinor};
 });
 if(volumeTotal>BigInt(Number.MAX_SAFE_INTEGER)||expectedTotal>BigInt(Number.MAX_SAFE_INTEGER))invalid('Shift total is too large.');
 const totalMilli=Number(volumeTotal),expectedMinor=Number(expectedTotal),varianceMinor=cashMinor-expectedMinor;
 return {version:2,rounding:'half-up-per-nozzle-to-paisa',sales,fuelSales:[...fuelMap.values()],totalMilli,expectedMinor,cashMinor,varianceMinor,balance:varianceMinor<0?'shortage':varianceMinor>0?'excess':'balanced'};
}
function reconcile(run){
 if(!run.calculation)invalid('This shift has not been calculated yet.');const stored=run.calculation;const computed=calculate(run.readings,stored.cashMinor);
 const scalar=['totalMilli','expectedMinor','cashMinor','varianceMinor'];const matches=scalar.every(k=>stored[k]===computed[k])&&Array.isArray(stored.sales)&&stored.sales.length===computed.sales.length&&computed.sales.every(n=>{const s=stored.sales.find(v=>v.nozzleId===n.nozzleId);return s&&['fuelId','volumeMilli','rateMinor','expectedMinor'].every(k=>s[k]===n[k]);});
 const groupsMatch=!stored.version||stored.version<2||(Array.isArray(stored.fuelSales)&&stored.fuelSales.length===computed.fuelSales.length&&computed.fuelSales.every(f=>{const g=stored.fuelSales.find(v=>v.fuelId===f.fuelId);return g&&['fuelName','volumeMilli','expectedMinor','nozzleCount'].every(k=>g[k]===f[k]);})&&stored.balance===computed.balance&&stored.rounding===computed.rounding);
 return {matches:matches&&groupsMatch,calculation:computed,rateSource:'shift-start snapshot',version:stored.version||1};
}
module.exports={parseDecimal,calculate,reconcile};
