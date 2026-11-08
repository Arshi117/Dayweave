'use strict';
const $=selector=>document.querySelector(selector);
const frame=$('#product-demo'),desktop=$('#desktop');
const defaults={stripWidth:300,calendarWidth:500,calendarHeight:480};
const state={height:44,calendar:false,expanded:false,dimensions:{...defaults},anchor:null,docked:false,ready:false,experience:'focus',selected:false};
let scale=1,drag=null,resize=null,resetTimer;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function send(type,data={}){frame.contentWindow?.postMessage({channel:'dayweave-demo-host',type,...data},location.origin);}
function compactHeight(){return 44*scale;}
function defaultAnchor(){return{x:innerWidth<=760?18:Math.min(64,desktop.clientWidth-320),y:142};}
function dockAnchor(){return{x:8,y:desktop.clientHeight-48+(48-compactHeight())/2};}
function layout(){
  const area=desktop.clientWidth,height=desktop.clientHeight,sidebar=Math.max(300,state.dimensions.stripWidth);
  const width=state.calendar?sidebar+8+state.dimensions.calendarWidth:state.expanded?sidebar:state.dimensions.stripWidth;
  scale=Math.min(1,(area-16)/width);
  const anchor=state.docked?dockAnchor():(state.anchor||defaultAnchor());
  const x=clamp(anchor.x,4,Math.max(4,area-width*scale-4));
  const frameHeight=state.height*scale;
  const y=state.docked?anchor.y-(state.height-44)*scale:clamp(anchor.y,8,Math.max(8,height-(drag?0:54)-frameHeight));
  Object.assign(frame.style,{width:width+'px',height:state.height+'px',left:x+'px',top:y+'px',transform:'scale('+scale+')'});
  desktop.dataset.docked=String(state.docked);
  const availableHeight=state.docked?(anchor.y-10)/scale+44:(height-54-y)/scale;
  send('placement',{placement:{above:state.docked,docked:state.docked,left:false,availableHeight:Math.max(180,availableHeight),availableWidth:width,dimensions:{...state.dimensions}}});
}
function markExperience(name){state.experience=name;desktop.dataset.view=name;document.querySelectorAll('[data-experience]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.experience===name)));}
function selectExperience(name){
  state.selected=true;markExperience(name);
  if(name==='dock'){
    state.docked=true;state.anchor=null;send('collapse');layout();
    $('#demo-status').textContent='已停靠在桌面左下角，点击小条上沿展开。';
  }else{
    if(name==='calendar'&&!state.docked)state.anchor={x:20,y:62};
    send('experience',{name});layout();
  }
}
function dockingCandidate(anchor){return anchor.x<175&&anchor.y+compactHeight()>desktop.clientHeight-92;}
function applyResize(gesture,dx,dy){
  const {target,edge,dimensions:d}=gesture;
  if(target==='strip')state.dimensions.stripWidth=clamp(d.stripWidth+(edge.includes('left')?-dx:dx),180,500);
  else{
    if(/left|right/.test(edge))state.dimensions.calendarWidth=clamp(d.calendarWidth+(edge.includes('left')?-dx:dx),400,850);
    if(/top|bottom/.test(edge))state.dimensions.calendarHeight=clamp(d.calendarHeight+(edge.includes('top')?-dy:dy),420,540);
  }layout();
}
addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.channel!=='dayweave-product-demo')return;
  const data=event.data;
  if(data.type==='ready'){
    state.ready=true;clearTimeout(resetTimer);$('#demo-loading').hidden=true;
    layout();send('experience',{name:state.selected&&state.experience!=='dock'?state.experience:'compact'});
  }
  if(data.type==='layout'){state.height=clamp(data.height,44,1100);state.calendar=!!data.calendar;state.expanded=!!data.expanded;layout();}
  if(data.type==='drag-start'){
    const anchor={x:parseFloat(frame.style.left)||0,y:(parseFloat(frame.style.top)||0)+(state.docked?(state.height-44)*scale:0)};
    drag={x:data.x,y:data.y,anchor,candidate:false};state.anchor=anchor;state.docked=false;
    if(state.experience==='dock')markExperience('focus');
    send('collapse');desktop.dataset.dragging='true';layout();
  }
  if(data.type==='drag-move'&&drag){
    state.anchor={x:drag.anchor.x+data.x-drag.x,y:drag.anchor.y+data.y-drag.y};
    drag.candidate=dockingCandidate(state.anchor);desktop.dataset.dropReady=String(drag.candidate);layout();
  }
  if(data.type==='drag-end'&&drag){
    const docked=drag.candidate;drag=null;state.docked=docked;
    desktop.dataset.dragging='false';desktop.dataset.dropReady='false';
    if(docked){state.anchor=null;markExperience('dock');$('#demo-status').textContent='已停靠在桌面左下角。';}
    layout();
  }
  if(data.type==='resize-start')resize={...data,dimensions:{...state.dimensions}};
  if(data.type==='resize-move'&&resize)applyResize(resize,(data.x-resize.x)/scale,(data.y-resize.y)/scale);
  if(data.type==='resize-end')resize=null;
  if(data.type==='resize-step')applyResize({...data,dimensions:{...state.dimensions}},data.dx,data.dy);
  if(data.type==='notice')$('#demo-status').textContent=data.message;
});
function resetExample(){
  drag=null;resize=null;Object.assign(state,{height:44,calendar:false,expanded:false,dimensions:{...defaults},anchor:null,docked:false,ready:false,selected:false});
  desktop.dataset.dragging='false';desktop.dataset.dropReady='false';markExperience('focus');
  $('#demo-loading').hidden=false;$('#demo-status').textContent='';frame.src='product-demo/index.html?surface=focus&reset='+Date.now();layout();
  resetTimer=setTimeout(()=>{if(!state.ready)$('#demo-loading').textContent='加载较慢，请点击“重新开始”。';},12000);
}
function updateClock(){const now=new Date();$('#desktop-clock').textContent=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});$('#desktop-date').textContent=now.toLocaleDateString('zh-CN');}
updateClock();setInterval(updateClock,30000);
document.querySelectorAll('[data-experience]').forEach(button=>button.addEventListener('click',()=>selectExperience(button.dataset.experience)));
$('#try-connections').addEventListener('click',()=>{selectExperience('connections');$('#try').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
$('#reset-demo').addEventListener('click',resetExample);frame.addEventListener('load',layout);
new ResizeObserver(layout).observe(desktop);layout();
const dialog=$('#download-dialog');let downloadTrigger;
document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',()=>{downloadTrigger=button;dialog.showModal();}));
$('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>downloadTrigger?.focus());
dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
