'use strict';
function compare(db,record){return record.readings.map(admin=>{
 const start=Date.parse(record.from),end=Date.parse(record.to),rows=[],issues=[],blocked=[];
 for(const run of db.runs||[]){if(run.stationId!==record.stationId||run.machineId!==record.machineId)continue;const s=Date.parse(run.startedAt||run.createdAt),e=run.endedAt?Date.parse(run.endedAt):Infinity;if(s>=end||e<start||(e===start&&s<start))continue;const reading=run.readings.find(n=>n.nozzleId===admin.nozzleId);if(!reading)continue;
 if(s<start||e>end){blocked.push({runId:run.id,reason:run.status==='completed'?'Shift crosses interval boundary':'Unfinished shift overlaps interval'});continue;}
 if(run.status!=='completed'||!reading.opening||!reading.closing){blocked.push({runId:run.id,reason:'Shift is incomplete'});continue;}
 rows.push({runId:run.id,salesman:run.snapshot.salesmanName,startedAt:run.startedAt,endedAt:run.endedAt,opening:reading.opening.value,closing:reading.closing.value,volume:reading.closing.value-reading.opening.value});
 }
 rows.sort((a,b)=>a.startedAt.localeCompare(b.startedAt)||a.endedAt.localeCompare(b.endedAt));
 for(let i=1;i<rows.length;i++){if(rows[i].startedAt<rows[i-1].endedAt)blocked.push({runId:rows[i].runId,reason:'Salesman shifts overlap'});if(rows[i].opening!==rows[i-1].closing)issues.push('Meter gap between consecutive salesman shifts');}
 const adminVolume=admin.closing-admin.opening,opening=rows.length?rows[0].opening:null,closing=rows.length?rows[rows.length-1].closing:null,volume=rows.reduce((sum,r)=>sum+r.volume,0);
 if(!rows.length)issues.push('No completed salesman readings in this interval');
 if(rows.length&&opening!==admin.opening)issues.push('Starting reading differs');if(rows.length&&closing!==admin.closing)issues.push('Ending reading differs');if(rows.length&&volume!==adminVolume)issues.push('Total fuel volume differs');if(rows.some(r=>r.volume<0))issues.push('Salesman closing reading is lower than opening');
 return {nozzleId:admin.nozzleId,number:admin.number,fuelName:admin.fuelName,adminOpening:admin.opening,adminClosing:admin.closing,adminVolume,salesmanOpening:opening,salesmanClosing:closing,salesmanVolume:rows.length?volume:null,openingDifference:opening===null?null:opening-admin.opening,closingDifference:closing===null?null:closing-admin.closing,volumeDifference:rows.length?volume-adminVolume:null,status:!rows.length||blocked.length?'Incomplete':issues.length?'Mismatch':'Matched',issues:[...new Set(issues)],blocked,shifts:rows};
 });}
module.exports={compare};
