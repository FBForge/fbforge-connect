import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStructuredData } from '../frontend/src/structured-data.js';
import { annotateSchema } from '../frontend/src/schema-annotations.js';
const uri = 'https://schemas.example.test/root.json';
function annotate(data, schema, documents = {}) {
  const model = parseStructuredData(data, 'json');
  const before = JSON.stringify(model);
  const result = annotateSchema(model, JSON.stringify({schemaPackage:1,schemaUri:uri,documents:{[uri]:schema,...documents}}), uri);
  assert.equal(JSON.stringify(model), before);
  return result;
}
const field = (result,key) => result.root.children.find(n=>n.key===key);
test('schema titles, descriptions, requirements and provenance annotate only submitted values',()=>{
 const result=annotate('{"F123":"Erika","F456":9007199254740993}',{title:'Antrag',type:'object',required:['F123'],properties:{F123:{title:'Vorname',description:'Rufname der Person',type:'string'},F456:{title:'Kennung',type:'integer'},missing:{default:'invented'}}});
 assert.equal(result.root.label,'Antrag'); assert.equal(field(result,'F123').label,'Vorname');
 assert.equal(field(result,'F123').schema.required,true);assert.equal(field(result,'F456').value,'9007199254740993');
 assert.equal(result.root.children.length,2);assert.equal(field(result,'F123').schema.sources[0].location,'/properties/F123');
});
test('external references, nested resource identifiers, anchors and array items resolve without network',()=>{
 const result=annotate('{"a":[{"x":"Erika"}]}',{properties:{a:{type:'array',items:{$ref:'person.json#person'}}}}, {'https://schemas.example.test/person.json':{$id:'person.json',$anchor:'person',properties:{x:{$ref:'#/$defs/name'}},$defs:{name:{title:'Vorname',type:'string'}}}});
 assert.equal(field(result,'a').children[0].children[0].label,'Vorname');
});
test('oneOf uses submitted discriminators, code titles describe values and conflicts remain explicit',()=>{
 const schema={properties:{kind:{title:'Art',oneOf:[{const:'A',title:'Antrag'},{const:'B',title:'Bescheid'}]},x:{oneOf:[{title:'Erste Bedeutung',type:'string'},{title:'Andere Bedeutung',type:'string'}]}}};
 const result=annotate('{"kind":"A","x":"Wert"}',schema);
 assert.equal(field(result,'kind').label,'Art');assert.equal(field(result,'kind').schema.valueLabel,'Antrag');
 assert.equal(field(result,'x').label,'X');assert.equal(field(result,'x').schema.ambiguous,true);
 const selected=annotate('{"kind":"A","x":"Wert"}',{oneOf:[{properties:{kind:{const:'A'},x:{title:'Vorname'}}},{properties:{kind:{const:'B'},x:{title:'Nachname'}}}]});
 assert.equal(field(selected,'x').label,'Vorname');
});
test('intersection conflicts, unresolved references and cycles do not invent labels',()=>{
 for(const schema of [{properties:{x:{allOf:[{title:'A'},{title:'B'}]}}},{properties:{x:{$ref:'missing.json'}}},{properties:{x:{$ref:'#/$defs/loop'}},$defs:{loop:{$ref:'#/$defs/loop'}}}]){
  const result=annotate('{"x":"Wert"}',schema); assert.equal(field(result,'x').label,'X');assert.equal(field(result,'x').value,'Wert');
 }
 assert.equal(field(annotate('{"x":1}',{allOf:[true,{properties:{x:{title:'Nummer'}}}]}),'x').label,'Nummer');
});
test('unsafe numeric discriminators do not select a potentially wrong branch',()=>{
 const result=annotate('{"n":9007199254740993,"x":"Wert"}',{oneOf:[{properties:{n:{const:9007199254740992},x:{title:'A'}}},{properties:{n:{type:'integer'},x:{title:'B'}}}]});
 assert.equal(field(result,'x').label,'X');
});
test('schema package identity and oversized or malformed sources fall back to original data',()=>{
 const model=parseStructuredData('{"x":1}','json');
 for(const document of ['{',JSON.stringify({schemaPackage:1,schemaUri:'https://other.test/',documents:{[uri]:{}}})])assert.equal(annotateSchema(model,document,uri).root,model.root);
 assert.equal(annotateSchema(model,'x'.repeat(8*1024*1024+1),uri).status,'limited');
});
test('legacy ref siblings are ignored and unevaluated pattern or dependency annotations stay conservative',()=>{
 const result=annotate('{"x":"Erika"}',{$schema:'http://json-schema.org/draft-07/schema#',properties:{x:{$ref:'#/definitions/name',title:'Ignored'}},definitions:{name:{title:'Vorname'}}});
 assert.equal(field(result,'x').label,'Vorname');
 for(const extra of [{patternProperties:{'.*':{title:'Andere Bedeutung'}}},{dependentSchemas:{x:{properties:{x:{title:'Andere Bedeutung'}}}}}])
  assert.equal(field(annotate('{"x":"Erika"}',{properties:{x:{title:'Vorname'}},...extra}),'x').label,'X');
});
