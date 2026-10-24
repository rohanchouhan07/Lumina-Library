import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true, protocolTimeout:120000, args:['--no-sandbox','--disable-dev-shm-usage']})
const p = await b.newPage()
const net = []
p.on('response', async (r) => {
  if (r.url().includes('docs.google.com/spreadsheets') || r.url().includes('googleusercontent')) {
    net.push(`${r.status()} ${r.url().slice(0, 110)}`)
  }
})
await p.setViewport({width:1440,height:1000})
await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,1000))
await p.evaluate(()=>{
  localStorage.clear()
  localStorage.setItem('lumina.sheets.config.v1', JSON.stringify({
    enabled:true,
    sheetUrl:'https://docs.google.com/spreadsheets/d/18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s/edit?usp=sharing',
    scriptUrl:'', autoPull:false, autoPush:false, lastSyncAt:null, lastVerifiedAt:null,
  }))
})
await p.goto('http://localhost:5173/login',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,1400))
await p.evaluate(()=>{ Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Administrator demo'))?.click() })
await new Promise(r=>setTimeout(r,1600))
await p.goto('http://localhost:5173/app/settings',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,1800))
await p.evaluate(()=>{ Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Test connection'))?.click() })
await new Promise(r=>setTimeout(r,2000))
const text = await p.evaluate(()=>document.body.innerText)
const lines = text.split('\n').map(l=>l.trim()).filter(Boolean)
const idx = lines.findIndex(l=>/sheet readable|could not reach|google sheets/i.test(l))
console.log('RESULT:', lines.slice(Math.max(0,idx), idx+4).join(' || '))
console.log('ROWS LABEL:', lines.find(l=>/book rows yet|book row/i.test(l)))
console.log('NETWORK:', net.join(' | ') || '(none)')
await p.screenshot({path:'/home/user/qa-screens/sheets-6-real-sheet.png', fullPage:false})
await b.close()
