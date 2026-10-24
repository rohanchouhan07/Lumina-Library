import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true, protocolTimeout:120000, args:['--no-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files']})
const p = await b.newPage()
const errs = []
p.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,200)) })
p.on('pageerror', e => errs.push('pageerror: '+e.message.slice(0,200)))
await p.setViewport({width:1280,height:900})
await p.goto('file:///home/user/qa-tools/sandbox-host.html', {waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,2500))
const frame = p.frames().find(f => f.url().includes('lumina-library-preview'))
console.log('frame found:', !!frame, frame?.url().slice(-40))
const body = frame ? await frame.evaluate(()=>document.body.innerText) : ''
console.log('rendered chars:', body.length)
console.log('hero present:', body.includes('Reimagined'))
console.log('localStorage blocked:', frame ? await frame.evaluate(()=>{ try { localStorage.setItem('x','1'); return false } catch { return true } }) : 'n/a')
await p.screenshot({path:'/home/user/qa-screens/sandbox-1-landing.png'})
// try to enter the admin demo inside the sandbox
if (frame) {
  await frame.evaluate(()=>{const el=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Get started'));el?.click()})
  await new Promise(r=>setTimeout(r,900))
  await frame.evaluate(()=>{const el=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Administrator demo'));el?.click()})
  await new Promise(r=>setTimeout(r,2000))
  const dash = await frame.evaluate(()=>document.body.innerText)
  console.log('dashboard reached:', dash.toLowerCase().includes('administrator overview'), '| hash:', await frame.evaluate(()=>location.hash))
  await p.screenshot({path:'/home/user/qa-screens/sandbox-2-dashboard.png'})
  // perform a mutation to confirm the memory fallback keeps it interactive
  await frame.evaluate(()=>{const el=Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')?.includes('books'));el?.click()})
  await new Promise(r=>setTimeout(r,1200))
  console.log('books page:', (await frame.evaluate(()=>document.body.innerText)).includes('Book inventory'))
}
console.log('errors:', errs.length, errs.slice(0,4))
await b.close()
