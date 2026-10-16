import test from 'node:test';
import assert from 'node:assert/strict';
import { listProfiles, openSavedProfile, forgetProfile, profileStatus } from '../frontend/src/profiles.js';
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const profile = { profileId:id(1), name:'Bauamt TEST', apiVersion:'v3', role:'online-service', keyCount:2, available:true };
test('profile list accepts public metadata only and rejects unexpected secrets and duplicate handles', async () => {
  const profiles = await listProfiles(async () => [profile]);
  assert.ok(Object.isFrozen(profiles)); assert.ok(Object.isFrozen(profiles[0]));
  for (const bad of [[profile,profile],[{...profile,secret:'synthetic-marker'}],[{...profile,profileId:'../elsewhere'}],[{...profile,keyCount:49}]])
    await assert.rejects(listProfiles(async () => bad), /engine_protocol_error/);
  const unavailable = {...profile,apiVersion:null,role:null,keyCount:0,available:false};
  assert.equal((await listProfiles(async()=>[unavailable]))[0].available,false);
});
test('saved profile opens only the selected API and returns a fresh TEST session without private material', async () => {
  const session={sessionId:id(2),apiVersion:'v3',role:'online-service',environment:'TEST',connected:true};
  assert.equal((await openSavedProfile(async(command,args)=>{assert.equal(command,'open_saved_profile');assert.deepEqual(args,{profileId:profile.profileId,restoreKeys:true});return session;},profile)).sessionId,id(2));
  for(const patch of [{apiVersion:'v2'},{environment:'PROD'},{privateJwk:'synthetic-marker'},{connected:false}])
    await assert.rejects(openSavedProfile(async()=>({...session,...patch}),profile),/engine_protocol_error/);
  await assert.rejects(openSavedProfile(()=>assert.fail('Unavailable profile reached native'),{...profile,available:false}),/invalid_input/);
});
test('profile forgetting checks acknowledgement and storage status distinguishes session-only from failed saving', async () => {
  await forgetProfile(async()=>null,profile.profileId);
  await assert.rejects(forgetProfile(async()=>({}),profile.profileId),/engine_protocol_error/);
  assert.equal((await profileStatus(async()=>({profileId:null,saved:false,error:null}),id(2))).saved,false);
  assert.equal((await profileStatus(async()=>({profileId:profile.profileId,saved:false,error:'vault_unavailable'}),id(2))).error,'vault_unavailable');
  for(const value of [{profileId:null,saved:true,error:null},{profileId:profile.profileId,saved:true,error:'vault_unavailable'},{profileId:profile.profileId,saved:false,error:null}])
    await assert.rejects(profileStatus(async()=>value,id(2)),/engine_protocol_error/);
});
