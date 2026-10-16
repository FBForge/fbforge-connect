import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDestinationRotation, executeDestinationRotation, cancelDestinationRotation } from '../frontend/src/destination-rotation.js';
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const session = { apiVersion:'v3', sessionId:id(1), environment:'TEST', connected:true };
const envelope = data => ({ apiVersion:session.apiVersion, sessionId:session.sessionId, environment:'TEST', data });
const target = {destinationId:id(2),bundleId:id(3),encryptionKid:id(4),signingKid:id(5)};
const row = {...target,name:'Bauamt TEST',beforeEncryptionKid:'legacy-kid',status:'prepared',stage:'not_started',error:null,httpStatus:null};
const preview = {attemptId:id(6),status:'prepared',changes:[row]};
test('bulk preview binds every destination and both independently generated key IDs',async()=>{
  const result = await prepareDestinationRotation(async(command,args)=>{
    assert.equal(command,'prepare_destination_rotation'); assert.deepEqual(JSON.parse(args.destinationDocument),{destinations:[{destinationId:target.destinationId,bundleId:target.bundleId}]});
    return envelope(preview);
  },session,[target]);
  assert.ok(Object.isFrozen(result.changes[0]));
  for(const patch of [{destinationId:id(8)},{bundleId:id(8)},{encryptionKid:id(8)},{signingKid:id(8)}]){
    const calls=[];
    await assert.rejects(prepareDestinationRotation(async(command)=>{
      calls.push(command); return envelope(command==='cancel_destination_rotation'?{...preview,status:'cancelled',changes:[]}:{...preview,changes:[{...row,...patch}]});
    },session,[target]),/engine_protocol_error/);
    assert.deepEqual(calls,['prepare_destination_rotation','cancel_destination_rotation']);
  }
});
test('invalid selection, duplicate destinations or shared key bundles never invoke native writes',async()=>{
  for(const targets of [[],[target,target],Array(11).fill(target),[{...target,bundleId:'bad'}]])
    await assert.rejects(prepareDestinationRotation(()=>assert.fail('must not invoke'),session,targets),/invalid_input/);
});
test('bulk completion must match immutable preview; lost writes retain fatal diagnostic context',async()=>{
  const completed={...preview,status:'completed',changes:[{...row,status:'updated',stage:'verified'}]};
  assert.equal((await executeDestinationRotation(async()=>envelope(completed),session,preview)).status,'completed');
  await assert.rejects(executeDestinationRotation(async()=>envelope({...completed,changes:[{...completed.changes[0],bundleId:id(9)}]}),session,preview),/engine_protocol_error/);
  await assert.rejects(executeDestinationRotation(async()=>{throw new Error('engine_timeout');},session,preview),/engine_timeout/);
  await assert.rejects(executeDestinationRotation(async()=>{throw new Error('secret must not leak');},session,preview),/resource_unavailable/);
  await assert.rejects(executeDestinationRotation(()=>assert.fail('must not invoke'),session,completed),/invalid_input/);
});
test('cancellation is a distinct native operation and clears the preview rows',async()=>{
  const result=await cancelDestinationRotation(async(command,args)=>{assert.equal(command,'cancel_destination_rotation');assert.equal(args.attemptId,preview.attemptId);return envelope({...preview,status:'cancelled',changes:[]});},session,preview.attemptId);
  assert.equal(result.status,'cancelled');
});
