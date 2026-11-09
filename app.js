'use strict';
const $=selector=>document.querySelector(selector);
const frame=$('#product-demo'),desktop=$('#desktop');
const defaults={stripWidth:300,calendarWidth:500,calendarHeight:480};
const state={platform:'windows',popupOpen:false,menuStatus:{title:'Dayweave',timer:''},height:44,calendar:false,expanded:false,dimensions:{...defaults},anchor:null,docked:false,ready:false,experience:'focus',selected:false};
let scale=1,drag=null,resize=null,resetTimer;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function send(type,data={}){frame.contentWindow?.postMessage({channel:'dayweave-demo-host',type,...data},location.origin);}
function compactHeight(){return 44*scale;}
function isMac(){return state.platform==='mac';}
function inMenuBar(){return isMac();}
function workArea(){return{top:isMac()?36:8,bottom:desktop.clientHeight-(isMac()?88:54)};}
function defaultAnchor(){return isMac()?{x:Math.max(18,desktop.clientWidth-state.dimensions.stripWidth*scale-30),y:104}:{x:innerWidth<=760?18:Math.min(64,desktop.clientWidth-320),y:142};}
function dockAnchor(){return{x:8,y:desktop.clientHeight-48+(48-compactHeight())/2};}
function layout(){
  const area=desktop.clientWidth,height=desktop.clientHeight,sidebar=Math.max(300,state.dimensions.stripWidth);
  const width=state.calendar?sidebar+8+state.dimensions.calendarWidth:state.expanded?sidebar:state.dimensions.stripWidth;
  scale=Math.min(1,(area-16)/width);
  const anchor=state.docked?dockAnchor():(state.anchor||defaultAnchor());
  const trayRight=$('#mac-tray-button').getBoundingClientRect().right-desktop.getBoundingClientRect().left;
  const x=clamp(inMenuBar()?trayRight-width*scale:anchor.x,4,Math.max(4,area-width*scale-4));
  const frameHeight=state.height*scale;
  const work=workArea();
  const y=inMenuBar()?work.top:state.docked?anchor.y-(state.height-44)*scale:clamp(anchor.y,work.top,Math.max(work.top,(drag?height:work.bottom)-frameHeight));
  Object.assign(frame.style,{width:width+'px',height:state.height+'px',left:x+'px',top:y+'px',transform:'scale('+scale+')'});
  desktop.dataset.docked=String(state.docked);
  const availableHeight=state.docked?(anchor.y-work.top)/scale+44:(work.bottom-y)/scale;
  send('placement',{placement:{above:state.docked,docked:state.docked,menuBar:inMenuBar(),left:inMenuBar()&&width>state.dimensions.stripWidth,availableHeight:Math.max(180,availableHeight),availableWidth:width,dimensions:{...state.dimensions}}});
}
function markExperience(name){state.experience=name;desktop.dataset.view=name;document.querySelectorAll('[data-experience]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.experience===name)));}
function selectExperience(name){
  if(name==='dock'&&isMac()){
    state.selected=true;state.popupOpen=true;state.docked=false;frame.hidden=false;markExperience('dock');closeMacMenu();syncMacToggle();layout();send('open-details');return;
  }
  if(inMenuBar())state.popupOpen=true;
  frame.hidden=false;syncMacToggle();
  state.selected=true;markExperience(name);
  if(name==='dock'){
    state.docked=true;state.anchor=null;send('collapse');layout();
    $('#demo-status').textContent='已停靠在桌面左下角，点击小条上沿展开。';
  }else{
    // Only the last guide item or a deliberate drag enters the taskbar.
    // Returning to another feature always starts on the desktop again.
    state.docked=false;state.anchor=name==='calendar'?{x:20,y:62}:null;
    layout();send('experience',{name:name==='resize'?(isMac()?'calendar':'compact'):name});
  }
}
function dockingCandidate(anchor){const bottom=desktop.clientHeight-48;return !isMac()&&anchor.x<175&&anchor.y+compactHeight()>bottom-44&&anchor.y<bottom+64;}
function closeMacMenu(restoreFocus=false){$('#mac-tray-menu').hidden=true;$('#mac-tray-button').setAttribute('aria-expanded',String(inMenuBar()&&state.popupOpen));if(restoreFocus)$('#mac-tray-button').focus();}
function syncMacToggle(){$('[data-mac-action="toggle"]').textContent=frame.hidden?'显示当前安排':'隐藏当前安排';}
function syncMacMode(){
  $('#mac-tray-title').textContent=state.menuStatus.title;
  $('#mac-tray-timer').textContent=inMenuBar()?state.menuStatus.timer:'';$('#mac-tray-timer').hidden=!inMenuBar()||!state.menuStatus.timer;
  $('#mac-tray-button').title=state.menuStatus.title+(state.menuStatus.timer?' · '+state.menuStatus.timer:'');
}
function toggleMenuPopup(){
  state.popupOpen=!state.popupOpen;frame.hidden=!state.popupOpen;closeMacMenu();syncMacToggle();layout();
  if(state.popupOpen)send('open-details');else send('collapse');
}
function selectPlatform(platform){
  if(!['windows','mac'].includes(platform)||platform===state.platform)return;
  drag=null;resize=null;state.platform=platform;state.anchor=null;state.docked=false;frame.hidden=false;
  desktop.dataset.platform=platform;desktop.dataset.dragging='false';desktop.dataset.dropReady='false';
  $('.platform-switch').dataset.platform=platform;
  document.querySelectorAll('[name="demo-platform"]').forEach(input=>input.checked=input.value===platform);
  const name=isMac()?'Mac':'Windows';
  $('.desktop-viewport').setAttribute('aria-label',name+' 模拟桌面'+(isMac()?'':'，可横向滑动'));desktop.setAttribute('aria-label','可拖动和停靠的 '+name+' 模拟桌面');
  $('#desktop-caption').textContent=name+' 桌面 · 示例';
  $('#guide-intro').innerHTML=isMac()?'点击顶部事件，展开当前安排。':'按住移动，拉边缘调长度。<br>点横线展开。';
  $('#dock-label').textContent=isMac()?'顶部菜单栏':'停靠左下角';$('#dock-arrow').hidden=isMac();
  $('#dock-guide').textContent=isMac()?'事件与倒计时常驻，点击展开':'拖到桌面左下角，即可固定';
  $('#resize-label').textContent=isMac()?'调整日历':'调整长度';
  $('#resize-guide').textContent=isMac()?'拖动日历边缘，调整大小':'拖动左右边缘，自由伸缩';
  for(const id of ['mac-menubar','mac-dock'])$('#'+id).hidden=!isMac();
  state.popupOpen=false;syncMacMode();
  closeMacMenu();syncMacToggle();
  state.selected=isMac();frame.hidden=isMac();markExperience(isMac()?'dock':'focus');layout();send('collapse');
  $('#demo-status').textContent='已切换到 '+name+' 桌面体验。';
}
function applyResize(gesture,dx,dy){
  const {target,edge,dimensions:d}=gesture;
  if(target==='strip'){
    state.dimensions.stripWidth=clamp(d.stripWidth+(edge.includes('left')?-dx:dx),180,500);
    if(edge.includes('left')&&!state.docked)state.anchor={...gesture.anchor,x:gesture.anchor.x+(d.stripWidth-state.dimensions.stripWidth)*gesture.scale};
  }
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
    layout();if(inMenuBar()){if(state.popupOpen)send('experience',{name:state.experience==='dock'?'focus':state.experience==='resize'?'calendar':state.experience});else send('collapse');}else send('experience',{name:state.selected&&!['dock','resize'].includes(state.experience)?state.experience:'compact'});
  }
  if(data.type==='menu-status'&&typeof data.status?.timer==='string'&&typeof data.status.title==='string'){state.menuStatus=data.status;syncMacMode();if(inMenuBar())layout();}
  if(data.type==='hide'&&inMenuBar()){state.popupOpen=false;frame.hidden=true;closeMacMenu();syncMacToggle();}
  if(data.type==='layout'){state.height=clamp(data.height,44,1100);state.calendar=!!data.calendar;state.expanded=!!data.expanded;layout();}
  if(data.type==='drag-start'){
    if(isMac())return;
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
  if(data.type==='resize-start')resize={...data,dimensions:{...state.dimensions},anchor:{...(state.anchor||defaultAnchor())},scale};
  if(data.type==='resize-move'&&resize)applyResize(resize,(data.x-resize.x)/scale,(data.y-resize.y)/scale);
  if(data.type==='resize-end')resize=null;
  if(data.type==='resize-step')applyResize({...data,dimensions:{...state.dimensions},anchor:{...(state.anchor||defaultAnchor())},scale},data.dx,data.dy);
  if(data.type==='notice')$('#demo-status').textContent=data.message;
});
function resetExample(){
  drag=null;resize=null;Object.assign(state,{height:44,calendar:false,expanded:false,dimensions:{...defaults},anchor:null,docked:false,ready:false,selected:false});
  frame.hidden=false;closeMacMenu();syncMacToggle();desktop.dataset.dragging='false';desktop.dataset.dropReady='false';markExperience('focus');
  if(isMac()){frame.hidden=true;state.popupOpen=false;markExperience('dock');syncMacMode();}
  closeMacMenu();syncMacToggle();
  $('#demo-loading').hidden=false;$('#demo-status').textContent='';frame.src='product-demo/index.html?surface=focus&reset='+Date.now();layout();
  resetTimer=setTimeout(()=>{if(!state.ready)$('#demo-loading').textContent='加载较慢，请点击“重新开始”。';},12000);
}
function updateClock(){const now=new Date();const time=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});$('#desktop-clock').textContent=time;$('#desktop-date').textContent=now.toLocaleDateString('zh-CN');$('#mac-clock').textContent=now.toLocaleDateString('zh-CN',{month:'short',day:'numeric',weekday:'short'})+' '+time;$('#mac-dock-day').textContent=now.getDate();}
updateClock();setInterval(updateClock,30000);
document.querySelectorAll('[data-experience]').forEach(button=>button.addEventListener('click',()=>selectExperience(button.dataset.experience)));
document.querySelectorAll('[name="demo-platform"]').forEach(input=>input.addEventListener('change',()=>selectPlatform(input.value)));
$('#mac-tray-button').addEventListener('click',toggleMenuPopup);
$('#mac-tray-button').addEventListener('contextmenu',event=>{event.preventDefault();$('#mac-tray-menu').hidden=false;$('#mac-tray-button').setAttribute('aria-expanded','true');});
document.querySelectorAll('[data-mac-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.macAction;
  if(action==='toggle'){if(inMenuBar())toggleMenuPopup();else{frame.hidden=!frame.hidden;syncMacToggle();}$('#demo-status').textContent=frame.hidden?'小条已隐藏，可从 Mac 菜单重新显示。':'小条已显示。';}
  else{state.selected=true;state.popupOpen=inMenuBar();frame.hidden=false;syncMacToggle();markExperience(action);layout();send('experience',{name:action});}
  closeMacMenu(true);
}));
document.addEventListener('click',event=>{if(!event.target.closest('.mac-tray-menu,.mac-tray-button')){closeMacMenu();if(inMenuBar()&&state.popupOpen&&!event.target.closest('.product-demo,[data-experience]'))toggleMenuPopup();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#mac-tray-menu').hidden){event.preventDefault();closeMacMenu(true);}else if(inMenuBar()&&state.popupOpen){event.preventDefault();toggleMenuPopup();}}});
frame.addEventListener('pointerenter',()=>closeMacMenu());
$('#try-connections').addEventListener('click',()=>{selectExperience('connections');$('#try').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
$('#reset-demo').addEventListener('click',resetExample);frame.addEventListener('load',layout);
new ResizeObserver(layout).observe(desktop);layout();
const dialog=$('#download-dialog');let downloadTrigger;
document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',()=>{downloadTrigger=button;dialog.showModal();}));
$('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>downloadTrigger?.focus());
dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
