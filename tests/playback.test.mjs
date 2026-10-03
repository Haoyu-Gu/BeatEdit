import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the shipped handlers with synchronous and delayed media events.
// No audio decoding is simulated; these tests cover playback coordination.
const source=readFileSync(new URL('../static/js/beatedit.js',import.meta.url),'utf8')
  .replace(/renderTask\(\);followTaskHash\(\);\s*$/,'');
function fixture(){
  const nodes=new Map(),handlers=new Map(),audios=[],players=[];
  class Element{
    constructor(tag='DIV',id=''){this.tagName=tag;this.id=id;this.dataset={};this.attrs={};this.listeners=new Map();this.children=[];this.isConnected=true;this.textContent='';this.open=false;this.classList={toggle(){}};}
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
    async emit(type,detail){for(const fn of this.listeners.get(type)||[])await fn({target:this,detail});}
    setAttribute(key,value){this.attrs[key]=value;}
    getAttribute(key){return this.attrs[key];}
    set innerHTML(value){this.markup=value;this.children=value?[new Element()]:[];this.writes=(this.writes||0)+1;}
    get innerHTML(){return this.markup||'';}
    hasChildNodes(){return this.children.length>0;}
    replaceChildren(...children){for(const child of this.children)child.isConnected=false;this.children=children;this.markup='';}
    contains(child){return this.children.includes(child);}
    closest(selector){return selector==='[data-compare]'&&this.dataset.compare||selector==='[data-midi]'&&this.dataset.midi?this:null;}
  }
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Element('DIV',id));return nodes.get(id);};
  const dispatch=async(type,target)=>{for(const fn of handlers.get(type)||[])await fn({target});};
  const document={getElementById:node,querySelectorAll:selector=>selector==='audio'?audios.filter(a=>a.isConnected):selector==='midi-player'?players.filter(p=>p.isConnected):[],
    addEventListener(type,fn){const list=handlers.get(type)||[];list.push(fn);handlers.set(type,list);},
    createElement(tag){const el=new Element(tag.toUpperCase());if(tag==='midi-player'){el.stop=()=>el.emit('stop',{finished:false});players.push(el);}return el;}};
  const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:''},navigator:{},customElements:{get:()=>true},setTimeout,clearTimeout});
  vm.runInContext(source,context);
  function audio(key){const a=new Element('AUDIO','audio-'+key);a.dataset.label=key;a.paused=true;a.currentTime=0;a.ended=false;a.plays=0;
    a.play=async()=>{a.paused=false;a.ended=false;a.plays++;await dispatch('play',a);};
    a.pause=()=>{a.paused=true;};audios.push(a);nodes.set(a.id,a);return a;}
  async function pair(output){const b=new Element('BUTTON');b.dataset.compare=output.id;await dispatch('click',b);}
  async function midi(key='sys_A'){const b=new Element('BUTTON');b.dataset.side=key;b.dataset.midi=key+'.mid';b.setAttribute('aria-expanded','false');await dispatch('click',b);return {button:b,player:node('midi-'+key).children[0]};}
  return {node,audio,pair,midi,dispatch,run:code=>vm.runInContext(code,context),status:()=>node('playback-status').textContent};
}

test('input → output plays in order and reports completion',async()=>{
  const f=fixture(),input=f.audio('input'),output=f.audio('sys_A');
  await f.pair(output);assert.match(f.status(),/Playing input/);assert.equal(output.plays,0);
  input.ended=true;await f.dispatch('ended',input);assert.equal(output.plays,1);assert.equal(input.paused,true);
  output.ended=true;await f.dispatch('ended',output);assert.equal(f.status(),'Playback finished');
});
test('an unrelated preload failure does not cancel the queue or change status',async()=>{
  const f=fixture(),input=f.audio('input'),output=f.audio('sys_A'),other=f.audio('gt');
  await f.pair(output);const before=f.status();await f.dispatch('error',other);assert.equal(f.status(),before);
  await f.dispatch('ended',input);assert.equal(output.plays,1);
});
test('a queued output failure cancels the queue',async()=>{
  const f=fixture(),input=f.audio('input'),output=f.audio('sys_A');
  await f.pair(output);await f.dispatch('error',output);assert.match(f.status(),/could not load/);
  await f.dispatch('ended',input);assert.equal(output.plays,0);
});
test('stop and manual playback both invalidate an old queue',async()=>{
  for(const action of ['stop','switch']){
    const f=fixture(),input=f.audio('input'),output=f.audio('sys_A'),other=f.audio('gt');await f.pair(output);
    if(action==='stop')f.run('stopAll()');else await other.play();
    const before=f.status();await f.dispatch('ended',input);assert.equal(output.plays,0);assert.equal(f.status(),before);assert.equal(input.paused,true);
  }
});
test('disconnected old audio cannot overwrite the current playback status',async()=>{
  const f=fixture(),old=f.audio('input'),current=f.audio('sys_A');await old.play();old.isConnected=false;await current.play();
  const before=f.status();await f.dispatch('ended',old);await f.dispatch('error',old);assert.equal(f.status(),before);
});
test('opening and closing baselines preserves players and the active queue',async()=>{
  const f=fixture(),input=f.audio('input'),output=f.audio('sys_G'),disclosure=f.node('baseline-disclosure'),cards=f.node('baseline-cards');
  disclosure.open=true;await disclosure.emit('toggle');const writes=cards.writes;
  await f.pair(output);disclosure.open=false;await disclosure.emit('toggle');disclosure.open=true;await disclosure.emit('toggle');
  assert.equal(input.paused,false);assert.equal(cards.writes,writes);await f.dispatch('ended',input);assert.equal(output.plays,1);
  f.run('renderBaselines(true)');assert.equal(cards.writes,writes+1);
});
test('MIDI preview open/close alone does not interrupt MP3 playback',async()=>{
  const f=fixture(),input=f.audio('input');await input.play();const before=f.status(),{button}=await f.midi();
  assert.equal(input.paused,false);assert.equal(f.status(),before);await f.dispatch('click',button);assert.equal(input.paused,false);assert.equal(f.status(),before);
});
test('MIDI start cancels MP3 queue and delayed pause cannot overwrite MIDI status',async()=>{
  const f=fixture(),input=f.audio('input'),output=f.audio('sys_A');await f.pair(output);input.currentTime=1;
  const {player}=await f.midi();await player.emit('start');assert.equal(input.paused,true);
  await f.dispatch('pause',input);assert.equal(f.status(),'Playing synthesized MIDI');await f.dispatch('ended',input);assert.equal(output.plays,0);
  await player.emit('stop',{finished:true});assert.equal(f.status(),'Playback finished');
});
test('switching MIDI players and back to MP3 ignores old stop events',async()=>{
  const f=fixture(),input=f.audio('input'),a=await f.midi('sys_A'),b=await f.midi('sys_B');
  await a.player.emit('start');await b.player.emit('start');assert.equal(f.status(),'Playing synthesized MIDI');
  await a.player.emit('stop',{finished:true});assert.equal(f.status(),'Playing synthesized MIDI');
  await input.play();await b.player.emit('stop',{finished:false});assert.equal(f.status(),'Playing · input');
  input.currentTime=1;input.pause();await f.dispatch('pause',input);assert.equal(f.status(),'Paused');
});
test('closing the active MIDI preview stops it and resets status',async()=>{
  const f=fixture(),{button,player}=await f.midi();await player.emit('start');await f.dispatch('click',button);
  assert.equal(f.status(),'Ready to compare');assert.equal(player.isConnected,false);
});
