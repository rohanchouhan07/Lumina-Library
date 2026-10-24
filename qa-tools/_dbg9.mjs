import puppeteer from 'puppeteer'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox'],protocolTimeout:20000})
const page=await b.newPage(); await page.setViewport({width:1440,height:1000})
let reqs=0
page.on('request',r=>{ if(r.url().includes('/api')) reqs++ })
page.on('pageerror',e=>console.log('PAGEERROR:', String(e).slice(0,200)))
const t0=Date.now()
await page.goto('http://localhost:5174/login',{waitUntil:'domcontentloaded',timeout:30000})
console.log('login mounted in', Date.now()-t0,'ms')
for (let i=0;i<6;i++){
  await sleep(2000)
  try {
    const info = await page.evaluate(()=>({ text: document.body.innerText.slice(0,60).replace(/\n/g,' '), keys: Object.keys(localStorage).length }))
    console.log(`@${2*(i+1)}s`, JSON.stringify(info), 'api reqs so far:', reqs)
  } catch(e) { console.log(`@${2*(i+1)}s EVAL FAILED:`, String(e).slice(0,80)) }
}
await b.close()
