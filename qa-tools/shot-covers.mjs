import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true,args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({width:1440,height:1200})
await p.goto('http://localhost:5173/catalog',{waitUntil:'networkidle2'})
await new Promise(r=>setTimeout(r,1200))
await p.screenshot({path:'/home/user/qa-screens/covers-check.png'})
await b.close()
