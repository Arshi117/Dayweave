'use strict';
const $=selector=>document.querySelector(selector);
const frame=$('#product-demo'),desktop=$('#desktop');
const defaults={stripWidth:300,calendarWidth:500,calendarHeight:480};
const state={platform:'windows',macFloating:false,macFloatAnchor:null,popupOpen:false,menuStatus:{title:'Dayweave',timer:''},height:44,calendar:false,expanded:false,dimensions:{...defaults},anchor:null,dockX:null,docked:false,left:false,ready:false,experience:'focus',selected:false};
let scale=1,drag=null,resize=null,resetTimer,dragEndedAt=0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function send(type,data={}){frame.contentWindow?.postMessage({channel:'dayweave-demo-host',type,...data},location.origin);}
function compactHeight(){return 44*scale;}
function isMac(){return state.platform==='mac';}
function inMenuBar(){return isMac()&&!state.macFloating;}
function workArea(){return{top:isMac()?36:8,bottom:desktop.clientHeight-(isMac()?88:54)};}
function defaultAnchor(){return isMac()?{x:Math.max(18,desktop.clientWidth-state.dimensions.stripWidth*scale-30),y:104}:{x:innerWidth<=760?18:Math.min(64,desktop.clientWidth-320),y:142};}
function dockAnchor(){return{x:clamp(state.dockX??8,4,Math.max(4,desktop.clientWidth-state.dimensions.stripWidth*scale-4)),y:desktop.clientHeight-48+(48-compactHeight())/2};}
function layout(){
  const area=desktop.clientWidth,height=desktop.clientHeight,sidebar=Math.max(300,state.dimensions.stripWidth);
  const width=state.calendar?sidebar+8+state.dimensions.calendarWidth:state.expanded?sidebar:state.dimensions.stripWidth;
  scale=Math.min(1,(area-16)/width);
  const anchor=state.docked?dockAnchor():(state.anchor||defaultAnchor());
  const trayRight=$('#mac-tray-button').getBoundingClientRect().right-desktop.getBoundingClientRect().left;
  const left=inMenuBar()?width>state.dimensions.stripWidth:state.docked&&width>state.dimensions.stripWidth&&anchor.x+width*scale>area-4;
  state.left=left;
  const x=clamp(inMenuBar()?trayRight-width*scale:left?anchor.x-(width-state.dimensions.stripWidth)*scale:anchor.x,4,Math.max(4,area-width*scale-4));
  const frameHeight=state.height*scale;
  const work=workArea();
  const y=inMenuBar()?work.top:state.docked?anchor.y-(state.height-44)*scale:clamp(anchor.y,work.top,Math.max(work.top,(drag?height:work.bottom)-frameHeight));
  Object.assign(frame.style,{width:width+'px',height:state.height+'px',left:x+'px',top:y+'px',transform:'scale('+scale+')'});
  desktop.dataset.docked=String(state.docked);
  const availableHeight=state.docked?(anchor.y-work.top)/scale+44:(work.bottom-y)/scale;
  send('placement',{placement:{above:state.docked,docked:state.docked,menuBar:inMenuBar(),left,availableHeight:Math.max(180,availableHeight),availableWidth:width,dimensions:{...state.dimensions}}});
}
function markExperience(name){state.experience=name;desktop.dataset.view=name;document.querySelectorAll('[data-experience]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.experience===name)));}
function selectExperience(name){
  if(name==='floating'&&isMac()){selectMacPresentation(true);return;}
  if(name==='dock'&&isMac()){
    selectMacPresentation(false,true);return;
  }
  if(inMenuBar())state.popupOpen=true;
  frame.hidden=false;syncMacToggle();
  state.selected=true;markExperience(name);
  if(name==='dock'){
    state.dockX=state.dockX??state.anchor?.x??8;state.docked=true;state.anchor=null;send('collapse');layout();
    $('#demo-status').textContent='已停靠到底部任务栏，可以左右拖动调整位置。';
  }else{
    // Only the last guide item or a deliberate drag enters the taskbar.
    // Returning to another feature always starts on the desktop again.
    state.docked=false;if(!isMac()||!state.macFloating)state.anchor=name==='calendar'?{x:20,y:62}:null;
    layout();send('experience',{name:name==='resize'?(inMenuBar()?'calendar':'compact'):name});
  }
}
function dockingCandidate(anchor){const bottom=desktop.clientHeight-48;return !isMac()&&anchor.y+compactHeight()>=bottom-64*scale&&anchor.y<=bottom+120*scale;}
function closeMacMenu(restoreFocus=false){$('#mac-tray-menu').hidden=true;$('#mac-tray-button').setAttribute('aria-expanded',String(inMenuBar()&&state.popupOpen));if(restoreFocus)$('#mac-tray-button').focus();}
function syncMacToggle(){$('[data-mac-action="toggle"]').textContent=frame.hidden?'显示当前安排':'隐藏当前安排';}
function syncMacMode(){
  $('[data-mac-action="menu-bar"]').setAttribute('aria-pressed',String(!state.macFloating));$('[data-mac-action="floating"]').setAttribute('aria-pressed',String(state.macFloating));
  $('#mac-tray-title').textContent=state.menuStatus.title;
  $('#mac-tray-title').hidden=state.macFloating;
  $('#mac-tray-timer').textContent=state.menuStatus.timer;$('#mac-tray-timer').hidden=state.macFloating||!state.menuStatus.timer;
  $('#mac-tray-button').title=state.macFloating?'Dayweave · 显示或隐藏悬浮条':state.menuStatus.title+(state.menuStatus.timer?' · '+state.menuStatus.timer:'');
  $('#mac-tray-button').setAttribute('aria-label',inMenuBar()?'展开当前安排':'显示或隐藏悬浮条');
  if(isMac()){$('#guide-intro').innerHTML='从菜单栏拖下，变为悬浮条。<br>拖回顶部，即可停靠。';$('#resize-label').textContent=state.macFloating?'调整长度':'调整日历';$('#resize-guide').textContent=state.macFloating?'拖动左右边缘，自由伸缩':'拖动日历边缘，调整大小';}
}
function selectMacPresentation(floating,open=false){
  if(!isMac())return;
  drag=null;resize=null;state.macFloating=floating;state.popupOpen=!floating&&open;state.docked=false;state.anchor=floating?(state.macFloatAnchor||defaultAnchor()):null;state.selected=true;frame.hidden=!floating&&!open;
  markExperience(floating?'floating':'dock');syncMacMode();closeMacMenu();syncMacToggle();layout();send(floating||!open?'collapse':'open-details');
}
function toggleMenuPopup(){
  if(Date.now()-dragEndedAt<200)return;
  if(isMac()&&state.macFloating){frame.hidden=!frame.hidden;syncMacToggle();return;}
  state.popupOpen=!state.popupOpen;frame.hidden=!state.popupOpen;closeMacMenu();syncMacToggle();layout();
  if(state.popupOpen)send('open-details');else send('collapse');
}
function startDrag(data,source='strip'){
  const rect=desktop.getBoundingClientRect();
  const anchor=source==='tray'?{x:data.clientX-rect.left-state.dimensions.stripWidth*scale/2,y:data.clientY-rect.top-16}:
    {x:(parseFloat(frame.style.left)||0)+(state.left?((parseFloat(frame.style.width)||300)-state.dimensions.stripWidth)*scale:0),y:(parseFloat(frame.style.top)||0)+(state.docked?(state.height-44)*scale:0)};
  drag={x:data.x,y:data.y,anchor,candidate:state.docked,wasDocked:state.docked,active:false};
}
function moveDrag(data){
  if(!drag)return;
  const dx=data.x-drag.x,dy=data.y-drag.y;
  if(!drag.active){
    if(Math.hypot(dx,dy)<=6)return;
    drag.active=true;
    if(isMac()){state.macFloating=true;state.popupOpen=false;frame.hidden=false;markExperience('floating');syncMacMode();closeMacMenu();syncMacToggle();}
    else if(state.experience==='dock')markExperience('focus');
    send('collapse');desktop.dataset.dragging='true';
  }
  const anchor={x:drag.anchor.x+dx,y:drag.anchor.y+dy};
  state.anchor=anchor;drag.candidate=isMac()?anchor.y<=36:dockingCandidate(anchor);state.docked=!isMac()&&drag.wasDocked&&drag.candidate;
  if(state.docked)state.dockX=anchor.x;
  desktop.dataset.dropReady=String(drag.candidate);layout();
}
function finishDrag(){
  if(!drag)return;
  const {candidate,active}=drag;drag=null;
  desktop.dataset.dragging='false';desktop.dataset.dropReady='false';
  if(!active)return;
  dragEndedAt=Date.now();
  if(isMac()){
    if(candidate){selectMacPresentation(false);$('#demo-status').textContent='已停靠到顶部菜单栏，可再次向下拖出。';}
    else{state.macFloatAnchor={...state.anchor};layout();$('#demo-status').textContent='已变为桌面悬浮条，拖回顶部即可停靠。';}
  }else{
    state.docked=candidate;
    if(candidate){state.dockX=state.anchor?.x??state.dockX;state.anchor=null;markExperience('dock');$('#demo-status').textContent='已停靠到底部任务栏，可以左右滑动。';}
    layout();
  }
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
  $('#dock-label').textContent=isMac()?'顶部菜单栏':'底部任务栏';$('#dock-arrow').hidden=isMac();
  $('#dock-guide').textContent=isMac()?'事件与倒计时常驻，点击展开':'拖入底部停靠，左右滑动调整位置';
  $('#resize-label').textContent=isMac()?'调整日历':'调整长度';
  $('#resize-guide').textContent=isMac()?'拖动日历边缘，调整大小':'拖动左右边缘，自由伸缩';
  for(const id of ['mac-menubar','mac-dock'])$('#'+id).hidden=!isMac();
  $('[data-experience="floating"]').hidden=!isMac();
  state.popupOpen=false;syncMacMode();
  closeMacMenu();syncMacToggle();
  if(isMac())selectMacPresentation(state.macFloating);else{state.selected=false;markExperience('focus');layout();send('collapse');}
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
    layout();if(inMenuBar()){if(state.popupOpen)send('experience',{name:state.experience==='dock'?'focus':state.experience==='resize'?'calendar':state.experience});else send('collapse');}else send('experience',{name:state.selected&&!['dock','resize','floating'].includes(state.experience)?state.experience:'compact'});
  }
  if(data.type==='menu-status'&&typeof data.status?.timer==='string'&&typeof data.status.title==='string'){state.menuStatus=data.status;syncMacMode();if(inMenuBar())layout();}
  if(data.type==='hide'&&inMenuBar()){state.popupOpen=false;frame.hidden=true;closeMacMenu();syncMacToggle();}
  if(data.type==='layout'){state.height=clamp(data.height,44,1100);state.calendar=!!data.calendar;state.expanded=!!data.expanded;layout();}
  if(data.type==='drag-start'){
    startDrag(data);
  }
  if(data.type==='drag-move')moveDrag(data);
  if(data.type==='drag-end')finishDrag();
  if(data.type==='resize-start')resize={...data,dimensions:{...state.dimensions},anchor:{...(state.anchor||defaultAnchor())},scale};
  if(data.type==='resize-move'&&resize)applyResize(resize,(data.x-resize.x)/scale,(data.y-resize.y)/scale);
  if(data.type==='resize-end')resize=null;
  if(data.type==='resize-step')applyResize({...data,dimensions:{...state.dimensions},anchor:{...(state.anchor||defaultAnchor())},scale},data.dx,data.dy);
  if(data.type==='notice')$('#demo-status').textContent=data.message;
});
function resetExample(){
  drag=null;resize=null;Object.assign(state,{height:44,calendar:false,expanded:false,dimensions:{...defaults},anchor:null,dockX:null,macFloatAnchor:null,docked:false,ready:false,selected:false});
  frame.hidden=false;closeMacMenu();syncMacToggle();desktop.dataset.dragging='false';desktop.dataset.dropReady='false';markExperience('focus');
  if(isMac()){frame.hidden=!state.macFloating;state.popupOpen=false;markExperience(state.macFloating?'floating':'dock');syncMacMode();}
  closeMacMenu();syncMacToggle();
  $('#demo-loading').hidden=false;$('#demo-status').textContent='';frame.src='product-demo/index.html?surface=focus&reset='+Date.now();layout();
  resetTimer=setTimeout(()=>{if(!state.ready)$('#demo-loading').textContent='加载较慢，请点击“重新开始”。';},12000);
}
function updateClock(){const now=new Date();const time=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});$('#desktop-clock').textContent=time;$('#desktop-date').textContent=now.toLocaleDateString('zh-CN');$('#mac-clock').textContent=now.toLocaleDateString('zh-CN',{month:'short',day:'numeric',weekday:'short'})+' '+time;$('#mac-dock-day').textContent=now.getDate();}
updateClock();setInterval(updateClock,30000);
document.querySelectorAll('[data-experience]').forEach(button=>button.addEventListener('click',()=>selectExperience(button.dataset.experience)));
document.querySelectorAll('[name="demo-platform"]').forEach(input=>input.addEventListener('change',()=>selectPlatform(input.value)));
$('#mac-tray-button').addEventListener('click',toggleMenuPopup);
$('#mac-tray-button').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  event.currentTarget.setPointerCapture(event.pointerId);
  startDrag({x:event.screenX,y:event.screenY,clientX:event.clientX,clientY:event.clientY},'tray');
});
$('#mac-tray-button').addEventListener('pointermove',event=>{if(drag)moveDrag({x:event.screenX,y:event.screenY});});
$('#mac-tray-button').addEventListener('pointerup',event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);finishDrag();});
$('#mac-tray-button').addEventListener('pointercancel',()=>{drag=null;desktop.dataset.dragging='false';desktop.dataset.dropReady='false';});
$('#mac-tray-button').addEventListener('contextmenu',event=>{event.preventDefault();$('#mac-tray-menu').hidden=false;$('#mac-tray-button').setAttribute('aria-expanded','true');});
document.querySelectorAll('[data-mac-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.macAction;
  if(action==='floating'||action==='menu-bar'){selectMacPresentation(action==='floating');closeMacMenu(true);return;}
  if(action==='toggle'){if(inMenuBar())toggleMenuPopup();else{frame.hidden=!frame.hidden;syncMacToggle();}$('#demo-status').textContent=frame.hidden?'小条已隐藏，可从 Mac 菜单重新显示。':'小条已显示。';}
  else{state.selected=true;state.popupOpen=inMenuBar();frame.hidden=false;syncMacToggle();markExperience(action);layout();send('experience',{name:action});}
  closeMacMenu(true);
}));
document.addEventListener('click',event=>{
  if(event.target.closest('.mac-tray-menu,.mac-tray-button'))return;
  closeMacMenu();
  if(desktop.contains(event.target)&&!event.target.closest('.product-demo')&&!frame.hidden&&Date.now()-dragEndedAt>=200)send('outside-click');
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#mac-tray-menu').hidden){event.preventDefault();closeMacMenu(true);}else if(inMenuBar()&&state.popupOpen){event.preventDefault();toggleMenuPopup();}}});
frame.addEventListener('pointerenter',()=>closeMacMenu());
$('#try-connections').addEventListener('click',()=>{selectExperience('connections');$('#try').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
$('#reset-demo').addEventListener('click',resetExample);frame.addEventListener('load',layout);
new ResizeObserver(layout).observe(desktop);layout();
const dialog=$('#download-dialog');let downloadTrigger;
document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',()=>{downloadTrigger=button;dialog.showModal();}));
$('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>downloadTrigger?.focus());
dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
