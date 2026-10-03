const TASKS = {
  correction: {
    input_key: "input", input_label: "Corrupted Input",
    has_melody: false,
    systems: [
      { key: "sys_B", label: "SeqTag — BEAT-C" },
      { key: "sys_A", label: "IterEdit — BEAT-A" },
      { key: "sys_C", label: "TagFill — BEAT-A" },
      { key: "sys_D", label: "REMI + SeqTag" },
      { key: "sys_E", label: "CPWord + SeqTag" },
      { key: "sys_F", label: "Structured + SeqTag" },
      { key: "sys_G", label: "Diffusion SDEdit — BEAT-D" },
      { key: "sys_H", label: "BERT-CMLM — BEAT-D" },
      { key: "sys_J", label: "LLaMA-Selective — BEAT-A" },
      { key: "sys_L", label: "LLaMA-DetectRegen — BEAT-A" }
    ],
    samples: [
      { id:"sample_035" },
      { id:"sample_041" },
      { id:"sample_022" },
      { id:"sample_004" },
      { id:"sample_034" },
      { id:"sample_017" },
      { id:"sample_049" },
      { id:"sample_038" }
    ]
  },
  completion: {
    input_key: "input_with_gap", input_label: "Input with Gap",
    has_melody: false,
    systems: [
      { key: "sys_A", label: "TagFill — BEAT-A" },
      { key: "sys_B", label: "IterEdit — BEAT-A" },
      { key: "sys_G", label: "LLaMA-Selective — BEAT-A" },
      { key: "sys_J", label: "Anticipate Music Transformer" }
    ],
    samples: [
      { id:"sample_006" },
      { id:"sample_037" },
      { id:"sample_002" },
      { id:"sample_031" },
      { id:"sample_043" }
    ]
  },
  editing: {
    input_key: "input", input_label: "Corrupted Input",
    has_melody: true,
    systems: [
      { key: "sys_A", label: "IterEdit — BEAT-D" },
      { key: "sys_B", label: "TagFill — BEAT-D" },
      { key: "sys_C", label: "SeqTag — BEAT-C" },
      { key: "sys_D", label: "Diffusion SDEdit — BEAT-D" },
      { key: "sys_E", label: "BERT-CMLM — BEAT-D" },
      { key: "sys_G", label: "LLaMA-Selective — BEAT-A" }
    ],
    samples: [
      { id:"sample_039" },
      { id:"sample_022" },
      { id:"sample_043" },
      { id:"sample_048" },
      { id:"sample_014" },
      { id:"sample_020" }
    ]
  }
};

// The source's metadata above preserves every displayed sample and method.
const DESCRIPTIONS = {
  correction: ['Recover the original phrase.', 'Compare the corrupted input, ground truth, and three editing methods.'],
  editing: ['Refine the accompaniment. Keep the melody.', 'Listen to the same accompaniment revised by three editing methods.'],
  completion: ['Fill the gap in context.', 'Compare the two available BeatEdit methods with an autoregressive baseline.']
};
const state={task:'correction',samples:{correction:0,editing:0,completion:0}};
const $=id=>document.getElementById(id);
const pathFor=(task,sample,key,ext)=>'demo_content/'+task+'/'+sample+'/'+key+'.'+ext;
let queuedOutput=null,playbackEpoch=0,midiLoader,activeAudio=null,activeMidi=null;
const status=text=>{$('playback-status').textContent=text;};
function stopAll(){
  playbackEpoch++;queuedOutput=null;activeAudio=null;activeMidi=null;
  document.querySelectorAll('audio').forEach(audio=>{audio.pause();audio.currentTime=0;});
  document.querySelectorAll('midi-player').forEach(player=>{if(typeof player.stop==='function')player.stop();});
  status('Ready to compare');
}
function primarySystems(meta){
  const primary=meta.systems.filter(s=>/^(SeqTag|IterEdit|TagFill) — BEAT/.test(s.label));
  if(primary.length===2)primary.push(meta.systems.find(s=>s.key==='sys_J'));
  return primary;
}
function cardMarkup(key,label,type){
  const sample=TASKS[state.task].samples[state.samples[state.task]].id;
  const prefix=pathFor(state.task,sample,key,'');
  const id='audio-'+key;
  const isMethod=type==='method',baseline=isMethod&&!/^(SeqTag|IterEdit|TagFill) — BEAT/.test(label);
  const name=label.split(' — ')[0],encoding=label.split(' — ')[1];
  const hints={SeqTag:'Per-token correction',IterEdit:'Iterative refinement',TagFill:'Tag-then-fill'};
  const hint=isMethod?(hints[name]||'Comparison baseline'):(key==='gt'?'Observed target':key==='melody_only'?'Melody reference':'Starting draft');
  return '<article class="result-card '+(isMethod?'method-card':'reference-card')+(baseline?' baseline-card':'')+'">'+
    '<div class="result-heading"><span class="result-type">'+(isMethod?(baseline?'BASELINE':'BEATEDIT'):(key==='gt'?'GROUND TRUTH':'REFERENCE'))+'</span><h3>'+name+'</h3><p>'+hint+(encoding?' · '+encoding:'')+'</p></div>'+
    '<a class="roll-link" href="'+prefix+'png" target="_blank" rel="noopener noreferrer" aria-label="Open full-size '+label+' piano roll"><img src="'+prefix+'png" alt="'+label+' piano roll" width="1590" height="590" loading="lazy"></a>'+
    '<audio id="'+id+'" controls preload="metadata" src="'+prefix+'mp3" aria-label="'+label+' recording" data-label="'+label+'"></audio>'+
    (isMethod?'<button class="pair-button" data-compare="'+id+'" aria-label="Play input then '+label+'">▶ Input → '+name+'</button>':'')+
    '<details class="card-tools"><summary>MIDI &amp; full-size roll</summary><div class="panel-tools"><a href="'+prefix+'mid" download>Download MIDI ↓</a><button type="button" data-midi="'+prefix+'mid" data-side="'+key+'" aria-expanded="false" aria-controls="midi-'+key+'">Open MIDI player +</button><a href="'+prefix+'png" target="_blank" rel="noopener noreferrer">Expand roll ↗</a></div><div class="midi-container" id="midi-'+key+'"></div></details></article>';
}
function renderBaselines(reset=false){
  const meta=TASKS[state.task],shown=new Set(primarySystems(meta).map(s=>s.key));
  const other=meta.systems.filter(s=>!shown.has(s.key));
  $('baseline-summary').textContent='More baselines · '+other.length+' comparison'+(other.length===1?'':'s');
  // Preserve player nodes while the disclosure is closed, including queued outputs.
  if(reset)$('baseline-cards').replaceChildren();
  if($('baseline-disclosure').open&&!$('baseline-cards').hasChildNodes())$('baseline-cards').innerHTML=other.map(s=>cardMarkup(s.key,s.label,'method')).join('');
}
function renderPanels(){
  stopAll();
  const meta=TASKS[state.task],sample=meta.samples[state.samples[state.task]].id;
  $('reference-cards').innerHTML=cardMarkup(meta.input_key,meta.input_label,'reference')+cardMarkup('gt','Ground truth','reference')+
    (meta.has_melody?cardMarkup('melody_only','Original melody','reference'):'');
  $('reference-cards').classList.toggle('three-references',meta.has_melody);
  $('method-cards').innerHTML=primarySystems(meta).map(s=>cardMarkup(s.key,s.label,'method')).join('');
  renderBaselines(true);
  $('sample-id').textContent=sample.replace('sample_','Sample ')+' · '+(state.samples[state.task]+1)+' / '+meta.samples.length;
  $('previous-sample').disabled=state.samples[state.task]===0;
  $('next-sample').disabled=state.samples[state.task]===meta.samples.length-1;
}
function renderTask(){
  const meta=TASKS[state.task];
  document.querySelectorAll('[role=tab]').forEach(button=>{const active=button.dataset.task===state.task;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  $('comparison').setAttribute('aria-labelledby','tab-'+state.task);
  $('task-title').textContent=DESCRIPTIONS[state.task][0];$('task-description').textContent=DESCRIPTIONS[state.task][1];
  $('sample-select').replaceChildren(...meta.samples.map((sample,index)=>{
    const option=document.createElement('option');option.value=String(index);option.textContent=sample.id.replace('sample_','Sample ')+' · '+(index+1)+'/'+meta.samples.length;return option;
  }));
  $('sample-select').value=String(state.samples[state.task]);renderPanels();
}
function changeTask(task){if(!TASKS[task])return;state.task=task;renderTask();}
function changeSample(index){state.samples[state.task]=index;$('sample-select').value=String(index);renderPanels();}
document.querySelectorAll('[role=tab]').forEach(button=>{
  button.addEventListener('click',()=>changeTask(button.dataset.task));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const tasks=['correction','editing','completion'],current=tasks.indexOf(state.task);
    const next=event.key==='Home'?0:event.key==='End'?tasks.length-1:(current+(event.key==='ArrowRight'?1:-1)+tasks.length)%tasks.length;
    changeTask(tasks[next]);$('tab-'+tasks[next]).focus();
  });
});
$('sample-select').addEventListener('change',event=>changeSample(Number(event.target.value)));
$('previous-sample').addEventListener('click',()=>changeSample(Math.max(0,state.samples[state.task]-1)));
$('next-sample').addEventListener('click',()=>changeSample(Math.min(TASKS[state.task].samples.length-1,state.samples[state.task]+1)));
$('stop-audio').addEventListener('click',stopAll);
$('baseline-disclosure').addEventListener('toggle',()=>renderBaselines());
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-compare]');if(!button)return;
  stopAll();const epoch=playbackEpoch;
  const from=$('audio-'+TASKS[state.task].input_key),to=$(button.dataset.compare);
  if(!from||!to)return;
  queuedOutput={from,to};
  try{await from.play();if(epoch===playbackEpoch&&queuedOutput)status('Playing input → '+to.dataset.label);}
  catch{if(epoch===playbackEpoch){queuedOutput=null;status('Press play on the recording to retry.');}}
});
document.addEventListener('play',event=>{
  const audio=event.target;if(audio.tagName!=='AUDIO'||!audio.isConnected)return;
  if(!queuedOutput||audio!==queuedOutput.from){playbackEpoch++;queuedOutput=null;}
  activeAudio=audio;activeMidi=null;
  document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});
  document.querySelectorAll('midi-player').forEach(player=>{if(typeof player.stop==='function')player.stop();});
  status('Playing · '+audio.dataset.label);
},true);
document.addEventListener('ended',async event=>{
  const audio=event.target;if(audio.tagName!=='AUDIO'||audio!==activeAudio||!audio.isConnected)return;
  if(queuedOutput&&audio===queuedOutput.from){
    const to=queuedOutput.to,epoch=playbackEpoch;queuedOutput=null;
    try{if(to.isConnected)await to.play();else status('Output is no longer available. Select another example.');}catch{if(epoch===playbackEpoch)status('Press play on the output to continue.');}
  }else{activeAudio=null;status('Playback finished');}
},true);
document.addEventListener('pause',event=>{
  const audio=event.target;if(audio.tagName==='AUDIO'&&audio===activeAudio&&!activeMidi&&audio.isConnected&&!audio.ended&&audio.currentTime>0&&audio.paused)status('Paused');
},true);
document.addEventListener('error',event=>{
  const audio=event.target;
  if(audio.tagName==='AUDIO'&&audio.isConnected&&(audio===activeAudio||queuedOutput&&(audio===queuedOutput.from||audio===queuedOutput.to))){playbackEpoch++;queuedOutput=null;status('Recording could not load. Try another example or download the MIDI.');}
},true);
function loadMidi(){
  if(customElements.get('midi-player'))return Promise.resolve();
  if(!midiLoader)midiLoader=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/combine/npm/tone@14.7.77,npm/@magenta/music@1.23.1/es6/core.js,npm/html-midi-player@1.5.0';
    const timeout=setTimeout(()=>reject(new Error('MIDI component load timed out')),20000);
    script.onload=()=>{clearTimeout(timeout);customElements.get('midi-player')?resolve():reject(new Error('MIDI component unavailable'));};
    script.onerror=()=>{clearTimeout(timeout);reject(new Error('MIDI component load failed'));};
    document.head.appendChild(script);
  }).catch(error=>{midiLoader=null;throw error;});
  return midiLoader;
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-midi]');if(!button)return;
  const container=$('midi-'+button.dataset.side);
  if(button.getAttribute('aria-expanded')==='true'){if(activeMidi&&container.contains(activeMidi))stopAll();container.replaceChildren();button.setAttribute('aria-expanded','false');button.textContent='Open MIDI player +';return;}
  button.disabled=true;button.textContent='Loading MIDI player…';
  try{
    await loadMidi();if(!button.isConnected)return;
    const visualizer=document.createElement('midi-visualizer');visualizer.id='visualizer-'+button.dataset.side;visualizer.setAttribute('type','piano-roll');visualizer.setAttribute('src',button.dataset.midi);
    const player=document.createElement('midi-player');player.setAttribute('src',button.dataset.midi);player.setAttribute('sound-font','');player.setAttribute('visualizer','#'+visualizer.id);
    player.addEventListener('start',()=>{if(!player.isConnected)return;playbackEpoch++;queuedOutput=null;activeAudio=null;activeMidi=player;document.querySelectorAll('audio').forEach(audio=>audio.pause());document.querySelectorAll('midi-player').forEach(other=>{if(other!==player&&typeof other.stop==='function')other.stop();});status('Playing synthesized MIDI');});
    player.addEventListener('stop',event=>{if(activeMidi!==player)return;activeMidi=null;status(event.detail?.finished?'Playback finished':'Ready to compare');});
    container.replaceChildren(player,visualizer);button.setAttribute('aria-expanded','true');button.textContent='Close MIDI player −';
  }catch{if(button.isConnected){container.textContent='MIDI preview could not load. The MP3 recording and MIDI download remain available.';button.textContent='Retry MIDI player +';}}
  finally{button.disabled=false;}
});
function followTaskHash(){const task=location.hash.replace('#section-','');if(TASKS[task]){changeTask(task);$('explore').scrollIntoView({behavior:'smooth'});}}
window.addEventListener('hashchange',followTaskHash);
document.querySelectorAll('.mechanism').forEach(link=>link.addEventListener('click',()=>{if(location.hash===link.hash)followTaskHash();}));
$('copy-citation').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('bibtex').textContent);$('copy-citation').textContent='Copied ✓';$('copy-status').textContent='BibTeX copied to clipboard.';}
  catch{$('copy-status').textContent='Copy unavailable. Select the citation text to copy it manually.';$('copy-citation').textContent='Select text to copy';}
  setTimeout(()=>{$('copy-citation').textContent='Copy BibTeX';},2500);
});
renderTask();followTaskHash();
