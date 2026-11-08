'use strict';
const $ = selector => document.querySelector(selector);
const frame = $('#product-demo'), desktop = $('#desktop');
const dimensions = { stripWidth:348, calendarWidth:710, calendarHeight:560 };
const state = {height:44, calendar:false, expanded:false, dimensions:{...dimensions}, anchor:null, ready:false, experience:'focus'};
let scale=1, drag=null, resize=null, resetTimer;
const experiences = {
  focus:['眼前这一件，慢慢做。','试着延长 15 分钟，或完成这项安排。'],
  calendar:['把一周，轻轻拉开。','可以翻页、点击新建，也可以调整安排。'],
  tasks:['想到的事，一件件完成。','勾选一个待办，或给它安排一段时间。'],
  appearance:['换成你喜欢的样子。','用小条里的外观选项，找一个舒服的颜色。'],
  connections:['熟悉的安排，都带过来。','这是连接界面的预览，真实账号请在客户端连接。']
};
function send(type,data={}){frame.contentWindow?.postMessage({channel:'dayweave-demo-host',type,...data},location.origin);}
function layout(){
  const area=desktop.clientWidth;
  const sidebar=Math.max(300,state.dimensions.stripWidth);
  const width=state.calendar?sidebar+8+state.dimensions.calendarWidth:state.expanded?sidebar:state.dimensions.stripWidth;
  const narrowCalendar=state.calendar&&innerWidth<=600;
  scale=Math.min(state.calendar?1:1.13,(area-20)/(narrowCalendar?sidebar:width));
  const naturalX=narrowCalendar?6:(area-width*scale)/2;
  const anchor=state.anchor||{x:naturalX,y:28};
  const x=narrowCalendar?6:Math.max(6,Math.min(area-width*scale-6,anchor.x));
  const y=Math.max(12,Math.min(220,anchor.y));
  const minHeight=innerWidth<=600?340:370;
  desktop.style.height=Math.max(minHeight,Math.ceil(state.height*scale+y+35))+'px';
  desktop.dataset.view=state.experience;
  Object.assign(frame.style,{width:width+'px',height:state.height+'px',left:x+'px',top:y+'px',transform:'scale('+scale+')'});
  send('placement',{placement:{above:false,docked:false,left:false,availableHeight:710,availableWidth:width,dimensions:{...state.dimensions}}});
}
function selectExperience(name){
  state.experience=name;state.anchor=null;
  const [title,description]=experiences[name];
  $('#experience-title').textContent=title;$('#experience-description').textContent=description;
  document.querySelectorAll('[data-experience]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.experience===name)));
  send('experience',{name});layout();
  if(innerWidth<=600&&name==='calendar')$('#experience-description').textContent='左右滑动查看完整日历，也可以新建安排。';
}
function applyResize(gesture,dx,dy){
  const {target,edge,dimensions:d}=gesture;
  if(target==='strip')state.dimensions.stripWidth=Math.max(180,Math.min(600,d.stripWidth+(edge.includes('left')?-dx:dx)));
  else{
    if(/left|right/.test(edge))state.dimensions.calendarWidth=Math.max(400,Math.min(1100,d.calendarWidth+(edge.includes('left')?-dx:dx)));
    if(/top|bottom/.test(edge))state.dimensions.calendarHeight=Math.max(420,Math.min(850,d.calendarHeight+(edge.includes('top')?-dy:dy)));
  }layout();
}
addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.channel!=='dayweave-product-demo')return;
  const data=event.data;
  if(data.type==='ready'){state.ready=true;clearTimeout(resetTimer);$('#demo-loading').hidden=true;selectExperience(state.experience);}
  if(data.type==='layout'){
    const openedCalendar=data.calendar&&!state.calendar;
    state.height=Math.max(44,Math.min(1100,data.height));state.calendar=!!data.calendar;state.expanded=!!data.expanded;layout();
    if(openedCalendar&&innerWidth<=600)desktop.scrollLeft=(Math.max(300,state.dimensions.stripWidth)+8)*scale;
    if(!state.calendar)desktop.scrollLeft=0;
  }
  if(data.type==='drag-start')drag={x:data.x,y:data.y,anchor:{x:parseFloat(frame.style.left)||0,y:parseFloat(frame.style.top)||28}};
  if(data.type==='drag-move'&&drag){state.anchor={x:drag.anchor.x+data.x-drag.x,y:drag.anchor.y+data.y-drag.y};layout();}
  if(data.type==='drag-end')drag=null;
  if(data.type==='resize-start')resize={...data,dimensions:{...state.dimensions}};
  if(data.type==='resize-move'&&resize)applyResize(resize,(data.x-resize.x)/scale,(data.y-resize.y)/scale);
  if(data.type==='resize-end')resize=null;
  if(data.type==='resize-step')applyResize({...data,dimensions:{...state.dimensions}},data.dx,data.dy);
  if(data.type==='notice')$('#demo-status').textContent=data.message;
});
document.querySelectorAll('[data-experience]').forEach(button=>button.addEventListener('click',()=>selectExperience(button.dataset.experience)));
$('#try-connections').addEventListener('click',()=>{selectExperience('connections');$('#try').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
function resetExample(){
  drag=null;resize=null;Object.assign(state,{height:44,calendar:false,expanded:false,dimensions:{...dimensions},anchor:null,ready:false,experience:'focus'});
  $('#demo-loading').hidden=false;$('#demo-status').textContent='示例已重置。';frame.src='product-demo/index.html?surface=focus&reset='+Date.now();layout();
  resetTimer=setTimeout(()=>{if(!state.ready)$('#demo-loading').textContent='试用加载较慢，请点击“重来一次”。';},12000);
}
$('#reset-demo').addEventListener('click',resetExample);
frame.addEventListener('load',layout);addEventListener('resize',()=>{state.anchor=null;layout();});layout();
const dialog=$('#download-dialog');let downloadTrigger;
document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',()=>{downloadTrigger=button;dialog.showModal();}));
$('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>downloadTrigger?.focus());
dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
