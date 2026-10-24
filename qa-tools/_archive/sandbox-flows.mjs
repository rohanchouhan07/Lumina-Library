import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true, protocolTimeout:120000, args:['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files']})
const p = await b.newPage()
const errs=[]
p.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,160)) })
p.on('pageerror', e=>errs.push('pageerror: '+e.message.slice(0,160)))
await p.setViewport({width:1440,height:900})
await p.goto('file:///home/user/qa-tools/sandbox-host.html',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,2000))
let f = p.frames().find(x=>x.url().includes('lumina-library-preview'))
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const go=async(hash)=>{ const ok = await f.evaluate((h)=>{
  const link = Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')===h)
  if (link) { link.click(); return 'link' }
  return 'none'
},hash); await sleep(1500); return ok }
const text=async()=>f.evaluate(()=>document.body.innerText)
const clickText=async(t)=>{ const ok = await f.evaluate((label)=>{ const els=Array.from(document.querySelectorAll('button,a,[role=tab],[role=menuitem],[role=option]')); const el=els.find(e=>(e.innerText||'').toLowerCase().includes(label.toLowerCase())); if(el){el.click(); return true} return false },t); await sleep(600); return ok }

// login as librarian
// sign in via the sidebar-independent route: start at login by clearing session through the UI
await f.evaluate(()=>{ location.reload() })
await sleep(2500)
console.log('after reload, path:', await f.evaluate(()=>location.hash))
const f2 = p.frames().find(x=>x.url().includes('lumina-library-preview'))
await f2.evaluate(()=>{ const el=Array.from(document.querySelectorAll('a')).find(a=>a.innerText.includes('Sign in')); el?.click() })
await sleep(1500)
console.log('on login:', (await f2.evaluate(()=>document.body.innerText)).includes('Sign in to the demo'))
const pick = async(label)=> await f2.evaluate((t)=>{ const el=Array.from(document.querySelectorAll('[role=radio],button')).find(e=>(e.innerText||'').toLowerCase().includes(t)); if(el){el.click();return true} return false },label)
await pick('librarian')
await sleep(400)
await f2.evaluate(()=>{ const el=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Librarian demo')); el?.click() })
await sleep(2000)
console.log('librarian dashboard:', (await f2.evaluate(()=>document.body.innerText)).includes('Circulation desk'))

// add a book
f = p.frames().find(x=>x.url().includes('lumina-library-preview'))
await go('#/app/books')
await clickText('Add book')
await sleep(700)
const fill = async (sel,val)=>{ await f.evaluate((s,v)=>{ const el=document.querySelector(s); if(!el) return; const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set; set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})) },sel,val); await sleep(120) }
await fill('#book-form input[name="title"]','Sandbox Proof Title')
await fill('#book-form input[name="author"]','QA Bot')
await fill('#book-form input[name="publisher"]','Inline Press')
await fill('#book-form input[name="shelf"]','SB-01')
await fill('#book-form input[name="totalCopies"]','2')
await clickText('Add book')
await sleep(1200)
console.log('book created:', (await text()).includes('Sandbox Proof Title'))

// issue it
await go('#/app/loans?issue=1')
await sleep(600)
const combos = await f.$$('button[role="combobox"]')
if (combos[0]) { await combos[0].click(); await sleep(300) }
const search = await f.$('input[aria-label^="Search"]')
if (search) { await search.type('Sneha',{delay:15}); await sleep(400) }
await clickText('Sneha Iyer')
const combos2 = await f.$$('button[role="combobox"]')
if (combos2[1]) { await combos2[1].click(); await sleep(300) }
const search2 = await f.$('input[aria-label^="Search"]')
if (search2) { await search2.type('Sandbox Proof',{delay:15}); await sleep(500) }
await clickText('Sandbox Proof Title')
await clickText('Issue book')
await sleep(1500)
const t = await text()
console.log('issue toast:', t.includes('Book issued successfully'))

// reports charts
await go('#/app/reports')
await sleep(1800)
const charts = await f.$$('.recharts-surface')
console.log('report charts:', charts.length)
await p.screenshot({path:'/home/user/qa-screens/sandbox-3-reports.png'})

// student role + scoping
await go('#/login')
await clickText('student')
await clickText('Enter Student demo')
await sleep(1600)
console.log('student dashboard:', (await text()).includes('Welcome back'))
await go('#/app/members')
console.log('student restricted:', (await text()).includes('This area is restricted'))
await go('#/app/books')
await sleep(900)
await p.screenshot({path:'/home/user/qa-screens/sandbox-4-student-books.png'})
console.log('errors:', errs.length, errs.slice(0,3))
await b.close()
