import test from 'node:test';import assert from 'node:assert/strict';
import {prepareDestinationCleanup,executeDestinationCleanup,cancelDestinationCleanup} from '../frontend/src/destination-cleanup.js';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const session={apiVersion:'v3',sessionId:id(1),environment:'TEST',connected:true};
const envelope=data=>({apiVersion:'v3',sessionId:id(1),environment:'TEST',data});
const preview={attemptId:id(2),destinationId:id(3),name:'TEST-Entwurf',status:'prepared',error:null};
test('cleanup preparation never executes and completion is tied to the exact destination/name/attempt',async()=>{
 assert.equal((await prepareDestinationCleanup(async(command)=>{assert.equal(command,'prepare_destination_cleanup');return envelope(preview);},session,id(3))).status,'prepared');
 assert.equal((await executeDestinationCleanup(async()=>envelope({...preview,status:'removed'}),session,preview)).status,'removed');
 for(const patch of [{destinationId:id(8)},{attemptId:id(8)},{name:'Other'}])await assert.rejects(executeDestinationCleanup(async()=>envelope({...preview,...patch,status:'removed'}),session,preview),/engine_protocol_error/);
 await assert.rejects(executeDestinationCleanup(async()=>{throw new Error('engine_timeout');},session,preview),/engine_timeout/);
 assert.equal((await cancelDestinationCleanup(async(command)=>{assert.equal(command,'cancel_destination_cleanup');return envelope({...preview,status:'cancelled'});},session,id(2))).status,'cancelled');
});
