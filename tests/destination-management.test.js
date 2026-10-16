import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDestinationUpdate, executeDestinationUpdate, loadManagedDestination, destinationUpdateState, cancelDestinationUpdate } from '../frontend/src/destination-management.js';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', attempt = '33333333-3333-4333-8333-333333333333';
const session = { apiVersion: 'v3', sessionId: '44444444-4444-4444-8444-444444444444', environment: 'TEST', connected: true };
const envelope = data => ({ apiVersion: session.apiVersion, sessionId: session.sessionId, environment: 'TEST', data });
const row = { destinationId: A, name: 'Test', beforeJson: '{"name":"Test"}', afterJson: '{"name":"Test Alpha"}', status: 'prepared', error: null };
const preview = { attemptId: attempt, status: 'prepared', changes: [row] };

test('a bulk preview remains separate from its one confirmed execution and recovery is read-only', async () => {
  const calls = [];
  const invoke = async (command, args) => {
    calls.push([command,args]);
    if (command === 'prepare_destination_update') {
      assert.deepEqual(JSON.parse(args.destinationDocument), { destinationIds: [A], changes: { name: '{name} Alpha' } });
      return envelope(preview);
    }
    assert.equal(command, 'execute_destination_update'); assert.equal(args.attemptId, attempt);
    return envelope({ ...preview, status: 'completed', changes: [{ ...row, status: 'updated' }] });
  };
  const prepared = await prepareDestinationUpdate(invoke, session, [A], { name: '{name} Alpha' });
  assert.equal(calls.length,1); assert.equal(prepared.changes[0].before.name, 'Test');
  assert.equal((await executeDestinationUpdate(invoke, session, prepared)).status,'completed');
  let reads = 0;
  const result = await destinationUpdateState(async command => { assert.equal(command,'destination_update_state'); reads++; return envelope({ ...preview, status: 'uncertain', changes: [{ ...row, status: 'uncertain', error: 'resource_unavailable' }] }); },session);
  assert.equal(reads,1); assert.equal(result.status,'uncertain');
});

test('invalid fields, duplicate IDs and v2 writes cannot reach the native boundary', async () => {
  const forbidden = async () => { assert.fail('No native call'); };
  for (const [ids,changes] of [[[A,A],{name:'test'}], [[A],{callback:{url:'https://other.invalid'}}], [[A],{status:'decommissioned'}], [[A],{metadataVersions:['bad']}], [[A],{contactInformation:{secret:'no'}}], [[A],{name:''}]])
    await assert.rejects(prepareDestinationUpdate(forbidden,session,ids,changes));
  await assert.rejects(prepareDestinationUpdate(forbidden,{...session,apiVersion:'v2'},[A],{name:'test'}));
  await assert.rejects(executeDestinationUpdate(forbidden,session,{...preview,status:'uncertain'}));
});

test('foreign sessions, changed attempts, unknown properties and foreign destinations cannot report success', async () => {
  for (const invalid of [{...preview,unexpected:true},{...preview,attemptId:'invalid'},{...preview,changes:[{...row,destinationId:B}]}, {...preview,changes:[{...row,afterJson:'{"clientSecret":"no"}'}]}, {...preview,changes:[{...row,beforeJson:'{"contactInformation":null}',afterJson:'{"contactInformation":{"secret":"no"}}'}]}])
    await assert.rejects(prepareDestinationUpdate(async()=>envelope(invalid),session,[A],{name:'test'}));
  const prepared = await prepareDestinationUpdate(async()=>envelope(preview),session,[A],{name:'test'});
  await assert.rejects(executeDestinationUpdate(async()=>envelope({...preview,attemptId:B,status:'completed'}),session,prepared));
  await assert.rejects(prepareDestinationUpdate(async()=>({...envelope(preview),sessionId:B}),session,[A],{name:'test'}));
});

test('own detail accepts only the bounded contact view and cancellation retires the preview', async () => {
  const detail = { destinationId:A,name:'Test',status:'active',metadataVersions:['2.0.0'],possibleNextStatus:['inactive'],
    type:'A',offersJson:'{"publicServices":[],"processMessages":[]}',contactJson:JSON.stringify({legalName:'Test',address:null,phone:null,email:'test@example.invalid',unit:null,cc:['cc@example.invalid']}) };
  assert.equal((await loadManagedDestination(async(command,args)=>{assert.equal(command,'load_managed_destination');assert.equal(args.destinationId,A);return envelope(detail);},session,A)).contact.email,'test@example.invalid');
  await assert.rejects(loadManagedDestination(async()=>envelope({...detail,contactJson:'{"clientSecret":"no"}'}),session,A));
  assert.equal((await cancelDestinationUpdate(async(command,args)=>{assert.equal(command,'cancel_destination_update');assert.equal(args.attemptId,attempt);return envelope({attemptId:attempt,status:'cancelled',changes:[]});},session,attempt)).status,'cancelled');
});

test('an uncertain write is surfaced once without retries', async () => {
  const prepared = await prepareDestinationUpdate(async()=>envelope(preview),session,[A],{name:'test'}); let calls=0;
  await assert.rejects(executeDestinationUpdate(async()=>{calls++;throw new Error('resource_unavailable');},session,prepared),/resource_unavailable/);
  assert.equal(calls,1);
});
