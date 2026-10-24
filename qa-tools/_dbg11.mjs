import puppeteer from 'puppeteer'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox'],protocolTimeout:30000})
const page=await b.newPage(); await page.setViewport({width:1440,height:1100})
page.on('pageerror',e=>console.log('PAGEERROR:', String(e).slice(0,180)))
const step=async(name, fn)=>{const t=Date.now(); try{await fn(); console.log(`${name}: ${Date.now()-t}ms`)}catch(e){console.log(`${name}: FAILED ${String(e).slice(0,90)} (${Date.now()-t}ms)`)}} 
await step('goto /login', ()=>page.goto('http://localhost:5174/login',{waitUntil:'domcontentloaded',timeout:30000}))
await sleep(2000)
await step('fill+signin', ()=>page.evaluate(()=>{
  const labels=[...document.querySelectorAll('label')]
  const get=n=>{const l=labels.find(x=>(x.textContent||'').trim().startsWith(n)); return l?document.getElementById(l.getAttribute('for')):null}
  const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(el.constructor.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}))}
  set(get('Email or institutional ID'),'admin@lumina.edu'); set(get('Password'),'Lumina@2026')
  ;[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Sign in')?.click()
}))
await sleep(4000)
await step('goto /app/members', ()=>page.goto('http://localhost:5174/app/members',{waitUntil:'domcontentloaded',timeout:30000}))
await sleep(3000)
await step('clear storage', ()=>page.evaluate(()=>{for(const k of ['lumina.session.token.v1','lumina.session.remember.v1']){localStorage.removeItem(k);sessionStorage.removeItem(k)}}))
await step('goto /login again', ()=>page.goto('http://localhost:5174/login',{waitUntil:'domcontentloaded',timeout:30000}))
console.log('url:', page.url())
await b.close()
