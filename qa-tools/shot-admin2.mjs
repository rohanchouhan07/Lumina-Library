import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true,args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({width:1440,height:900})
await p.goto('http://localhost:5173/login',{waitUntil:'networkidle2'})
await p.evaluate(()=>{const el=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Administrator demo'));el?.click()})
await new Promise(r=>setTimeout(r,3200))
await p.screenshot({path:'/home/user/qa-screens/s-admin2.png'})
await b.close()
