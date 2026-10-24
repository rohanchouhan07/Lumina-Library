import puppeteer from 'puppeteer'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox'],protocolTimeout:15000})
const page=await b.newPage(); await page.setViewport({width:1440,height:1000})
page.on('pageerror',e=>console.log('PAGEERROR:', String(e).slice(0,200)))
page.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE:', m.text().slice(0,160)) })
await page.goto('http://localhost:5174/login',{waitUntil:'domcontentloaded'}); await sleep(2000)
await page.evaluate(()=>{
  const labels=[...document.querySelectorAll('label')]
  const get=n=>{const l=labels.find(x=>(x.textContent||'').trim().startsWith(n)); return l?document.getElementById(l.getAttribute('for')):null}
  const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(el.constructor.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}))}
  set(get('Email or institutional ID'),'student@lumina.edu'); set(get('Password'),'Student@2026')
  ;[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Sign in')?.click()
})
console.log('clicked sign in')
for (let i=0;i<5;i++){
  await sleep(2000)
  try {
    const info = await page.evaluate(()=>({ url: location.pathname, t: document.body.innerText.slice(0,50).replace(/\n/g,' ') }))
    console.log(`@${2*(i+1)}s`, JSON.stringify(info))
  } catch(e){ console.log(`@${2*(i+1)}s EVAL FAIL:`, String(e).slice(0,60)) }
}
await b.close()
