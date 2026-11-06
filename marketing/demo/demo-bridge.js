/* Demo transport only. The UI and behavior are the desktop renderer unchanged. */
(() => {
  const send = (type, value = {}) => parent.postMessage({ channel: 'dayweave-product-demo', type, ...value }, location.origin);
  const subscribers = new Map();
  const subscribe = name => fn => { if (!subscribers.has(name)) subscribers.set(name, new Set()); subscribers.get(name).add(fn); if (name === 'placement') queueMicrotask(() => fn(placement)); return () => subscribers.get(name).delete(fn); };
  const emit = (name, value) => subscribers.get(name)?.forEach(fn => fn(value));
  let placement = { above: false, left: false, availableHeight: 700, dimensions: { stripWidth: 300, calendarWidth: 760, calendarHeight: 620 } };
  const emptyFeed = { configured: false, sourceLabel: '', events: [], tasks: [], lastSynced: null, refreshing: false, error: '' };
  const google = { configured: true, connected: false, authorizing: false, refreshing: false, reconnectRequired: false, calendars: [], events: [], lastSynced: null, error: '' };
  const microsoft = { configured: true, connected: true, authorizing: false, refreshing: false, reconnectRequired: false, lists: [{id:'demo',name:'示例清单',selected:true}], tasks: [], lastSynced: Date.now(), error: '' };
  const links = { sources: [], error: '' };
  const denied = '网页演示不连接真实账号，请在 Windows 应用中操作。';
  const day = new Date(), today = [day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
  let range, latestPointer = {x:0,y:0};
  const feed = { ...emptyFeed };
  function dateAfter(days){const date=new Date(day);date.setDate(date.getDate()+days);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
  microsoft.tasks = [
    {id:'demo-task-interview',title:'准备面试',provider:'microsoft-todo',listId:'demo',listName:'示例清单',dueDate:dateAfter(1)},
    {id:'demo-task-notes',title:'整理课程笔记',provider:'microsoft-todo',listId:'demo',listName:'示例清单',dueDate:dateAfter(2)},
    {id:'demo-task-assignment',title:'提交课程作业',provider:'microsoft-todo',listId:'demo',listName:'示例清单',dueDate:dateAfter(4)},
    {id:'demo-task-reading',title:'整理阅读清单',provider:'microsoft-todo',listId:'demo',listName:'示例清单',dueDate:dateAfter(5)}
  ];
  const now = Date.now();
  const firstStart = new Date(day);
  firstStart.setDate(firstStart.getDate()+1);
  firstStart.setHours(14,0,0,0);
  const schedule = [['课程答疑',0,60],['小组讨论',120,150],['整理课堂笔记',180,240]];
  google.connected = true;
  google.lastSynced = now;
  google.calendars = [{id:'demo-study',name:'学习安排（示例）',selected:true,primary:true,accessRole:'reader'}];
  google.events = schedule.map(([title,start,end],index)=>({
    id:'google:demo-study-'+index,title,start:firstStart.getTime()+start*60_000,end:firstStart.getTime()+end*60_000,
    source:'subscription',provider:'google',calendarId:'demo-study',calendarName:'学习安排（示例）',
    description:'用于网页演示的 Google 日历示例安排，不来自真实账号。'
  }));
  // Only demo-owned keys on the website origin are reset; no desktop data exists here.
  for (const key of ['dayweave.entries.v1','dayweave.focus.session.v1','dayweave.focus.completed.v1','dayweave.focus.task.v1','dayweave.tasks.completed.v1']) localStorage.removeItem(key);
  localStorage.setItem('dayweave.appearance.v1',JSON.stringify('silver'));
  localStorage.setItem('dayweave.hints.seen.v1',JSON.stringify({move:true,pull:true,split:true}));
  const clone = value => structuredClone(value);
  const rejectGoogle = async () => ({...google,error:denied});
  const rejectMicrosoft = async () => ({...microsoft,error:denied});
  window.focusControls = {
    hide:()=>send('notice',{message:'网页预览不会隐藏桌面窗口。'}),
    resize:(height,calendar=false,expanded=false)=>send('layout',{height,calendar,expanded}),
    beginDimensionResize:(target,edge)=>send('resize-start',{target,edge,...latestPointer}),
    moveDimensionResize:()=>send('resize-move',latestPointer),endDimensionResize:()=>send('resize-end'),
    stepDimensionResize:(target,edge,dx,dy)=>send('resize-step',{target,edge,dx,dy}),
    onPlacement:subscribe('placement'),onOpenCalendar:subscribe('calendar'),onOpenSettings:subscribe('settings'),
    openCalendar:async()=>emit('calendar'),
    getSubscription:async()=>clone(feed),refreshSubscription:async()=>{feed.lastSynced=Date.now();return clone(feed)},
    saveSubscription:async()=>({...feed,error:denied}),removeSubscription:async()=>({...feed,error:denied}),
    setCalendarRange:async value=>{range=value;feed.range=value;return clone(feed)},
    getCalendarSource:async()=>({text:'',downloadedAt:Date.now(),error:'网页示例不提供真实订阅源文件。'}),
    getGoogle:async()=>clone(google),configureGoogle:rejectGoogle,connectGoogle:rejectGoogle,cancelGoogle:async()=>clone(google),refreshGoogle:async()=>{google.lastSynced=Date.now();return clone(google)},disconnectGoogle:async()=>{google.connected=false;google.events=[];emit('google',clone(google));return clone(google)},selectGoogleCalendars:async()=>clone(google),setGoogleRange:async value=>{google.range=value;return clone(google)},openGoogleEvent:async()=>false,onGoogle:subscribe('google'),
    getMicrosoft:async()=>clone(microsoft),configureMicrosoft:rejectMicrosoft,connectMicrosoft:rejectMicrosoft,cancelMicrosoft:async()=>clone(microsoft),refreshMicrosoft:async()=>clone(microsoft),disconnectMicrosoft:async()=>{microsoft.connected=false;microsoft.tasks=[];emit('microsoft',clone(microsoft));return clone(microsoft)},selectMicrosoftLists:async()=>clone(microsoft),onMicrosoft:subscribe('microsoft'),
    getTickTick:async()=>clone(emptyFeed),saveTickTick:async()=>({...emptyFeed,error:denied}),refreshTickTick:async()=>clone(emptyFeed),removeTickTick:async()=>clone(emptyFeed),setTickTickRange:async()=>clone(emptyFeed),onTickTick:subscribe('ticktick'),
    getCalendarLinks:async()=>clone(links),addCalendarLink:async()=>({...links,error:denied}),refreshCalendarLink:async()=>clone(links),removeCalendarLink:async()=>clone(links),setCalendarLinksRange:async()=>clone(links),onCalendarLinks:subscribe('links'),onSubscription:subscribe('subscription')
  };
  addEventListener('pointerdown',event=>{latestPointer={x:event.screenX,y:event.screenY};},true);
  addEventListener('pointermove',event=>{latestPointer={x:event.screenX,y:event.screenY};},true);
  addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.channel!=='dayweave-demo-host')return;
    const {type,...data}=event.data;
    if(type==='placement'){placement=data.placement;emit('placement',placement)}
  });
  // Electron supplies whole-strip dragging natively. Only its host movement is
  // simulated here; no desktop component, stylesheet or event handler is replaced.
  let drag=null;
  addEventListener('pointerdown',event=>{
    const pill=event.target.closest('.focus-pill');if(!pill||event.button!==0||event.target.closest('button,input,select,a'))return;
    drag={id:event.pointerId,pill};pill.setPointerCapture(event.pointerId);send('drag-start',{x:event.screenX,y:event.screenY});
  });
  addEventListener('pointermove',event=>{if(drag?.id===event.pointerId)send('drag-move',{x:event.screenX,y:event.screenY});});
  function finish(event){if(drag?.id!==event.pointerId)return;if(drag.pill.hasPointerCapture(event.pointerId))drag.pill.releasePointerCapture(event.pointerId);drag=null;send('drag-end');}
  addEventListener('pointerup',finish);addEventListener('pointercancel',finish);
  send('ready');
})();



