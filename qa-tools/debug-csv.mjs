import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true, protocolTimeout:120000, args:['--no-sandbox']})
const p = await b.newPage()
p.on('console', m=>console.log('CONSOLE', m.type(), m.text().slice(0,160)))
p.on('requestfailed', r=>console.log('REQFAIL', r.url().slice(0,90), r.failure()?.errorText))
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
await p.setViewport({width:1440,height:900})
await p.goto('http://localhost:5173/login',{waitUntil:'networkidle2'})
await p.evaluate(()=>{const el=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Administrator demo'));el?.click()})
await sleep(1500)
console.log('t1', Date.now())
try {
  await p.goto('http://localhost:5173/app/books',{waitUntil:'networkidle2', timeout: 20000})
  console.log('goto ok')
} catch(e) { console.log('goto fail', e.message) }
await sleep(500)
console.log('title', await p.title(), 'path', await p.evaluate(()=>location.pathname))
await p.screenshot({path:'/home/user/qa-screens/debug-books.png'})
await b.close()
