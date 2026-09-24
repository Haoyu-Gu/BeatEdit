import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'static/js/beatedit.js'),'utf8');
const tasks=vm.runInNewContext(source.slice(0,source.indexOf('// The source'))+';TASKS');
let count=0,examples=0;
for(const [task,meta] of Object.entries(tasks)){
  examples+=meta.samples.length;
  for(const sample of meta.samples){
    const keys=[meta.input_key,'gt',...meta.systems.map(s=>s.key)];
    if(meta.has_melody)keys.push('melody_only');
    for(const key of keys)for(const ext of ['png','mp3','mid']){
      const file=path.join(root,'demo_content',task,sample.id,key+'.'+ext);
      assert(fs.statSync(file).size>0,file);count++;
    }
  }
}
assert.equal(count,540);assert.equal(examples,19);
const primaryCode=source.slice(source.indexOf('function primarySystems('),source.indexOf('function cardMarkup('));
const selectPrimary=vm.runInNewContext(primaryCode+';primarySystems');
for(const meta of Object.values(tasks)){
  const primary=selectPrimary(meta);
  assert.equal(primary.length,3);
  assert.equal(new Set(primary.map(s=>s.key)).size,3);
  assert(primary.every(s=>meta.systems.some(original=>original.key===s.key)));
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'Duplicate IDs');
for(const match of html.matchAll(/(?:src|href)="((?:static\/)[^"]+)"/g))assert(fs.existsSync(path.join(root,match[1])),match[1]);
console.log(`PASS: ${examples} examples, ${count} media assets, unique IDs, local dependencies.`);
