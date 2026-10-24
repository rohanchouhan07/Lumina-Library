import puppeteer from 'puppeteer'
const BASE = 'http://localhost:5173'
const b = await puppeteer.launch({headless:true, protocolTimeout:120000, args:['--no-sandbox','--disable-dev-shm-usage']})
const p = await b.newPage()
const errors = []
p.on('console', m => { if (m.type()==='error') errors.push(m.text()) })
p.on('pageerror', e => errors.push('pageerror: '+e.message))
await p.setViewport({width:1440,height:900})
// fresh visitor
await p.goto(BASE, {waitUntil:'domcontentloaded'})
await p.evaluate(()=>localStorage.clear())
await p.goto(BASE, {waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,1500))
const h1 = await p.$eval('h1', el=>el.innerText.replace(/\s+/g,' ').trim())
const seeded = await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('lumina.library.data.v1')); return {books:d.books.length, members:d.members.length, loans:d.loans.length} })
console.log('hero:', h1)
console.log('first-run seed:', JSON.stringify(seeded))
for (const route of ['/catalog','/login','/books/BK-001']) {
  await p.goto(BASE+route, {waitUntil:'domcontentloaded'})
  await new Promise(r=>setTimeout(r,900))
  console.log(route, '->', (await p.evaluate(()=>document.body.innerText)).split('\n').filter(Boolean)[1]?.slice(0,60))
}
// enter demo and confirm dashboard
await p.goto(BASE+'/login', {waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,700))
await p.evaluate(()=>{const el=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Administrator demo'));el?.click()})
await new Promise(r=>setTimeout(r,1800))
console.log('/app ->', await p.evaluate(()=>location.pathname), '|', (await p.evaluate(()=>document.body.innerText)).includes('Administrator overview') ? 'dashboard ok' : 'dashboard MISSING')
console.log('console errors:', errors.length, errors.slice(0,3))
await p.screenshot({path:'/home/user/qa-screens/live-first-visit.png'})
await b.close()
