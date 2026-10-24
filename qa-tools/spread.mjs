import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true,args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({width:1440,height:900})
await p.goto('http://localhost:5173/',{waitUntil:'networkidle2'})
await p.evaluate(()=>localStorage.clear())
await p.goto('http://localhost:5173/',{waitUntil:'networkidle2'})
await new Promise(r=>setTimeout(r,800))
const spread = await p.evaluate(()=>{
  const d=JSON.parse(localStorage.getItem('lumina.library.data.v1'))
  const byMonth={}
  d.loans.forEach(l=>{const k=l.issuedAt.slice(0,7); byMonth[k]=(byMonth[k]||0)+1})
  const returned={}
  d.loans.filter(l=>l.returnedAt).forEach(l=>{const k=l.returnedAt.slice(0,7);returned[k]=(returned[k]||0)+1})
  return {loans:d.loans.length, byMonth, returned, books:d.books.length, members:d.members.length}
})
console.log(JSON.stringify(spread,null,1))
await b.close()
