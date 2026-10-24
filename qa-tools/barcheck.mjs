import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true,args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({width:1440,height:900})
await p.goto('http://localhost:5173/login',{waitUntil:'networkidle2'})
await p.evaluate(()=>{const el=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Administrator demo'));el?.click()})
await new Promise(r=>setTimeout(r,2500))
const info = await p.evaluate(()=>{
  const bars = Array.from(document.querySelectorAll('.recharts-bar-rectangle path'))
  return {
    count: bars.length,
    xs: bars.slice(0,16).map(el=>{const bb=el.getBoundingClientRect(); return Math.round(bb.x)+':'+Math.round(bb.width)}),
    svgW: document.querySelector('.recharts-surface')?.getBoundingClientRect().width,
  }
})
console.log(JSON.stringify(info))
await b.close()
