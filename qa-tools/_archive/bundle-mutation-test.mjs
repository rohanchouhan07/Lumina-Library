import puppeteer from 'puppeteer'
const b = await puppeteer.launch({headless:true, protocolTimeout:120000, args:['--no-sandbox','--disable-dev-shm-usage']})
const p = await b.newPage()
await p.setViewport({width:1440,height:900})
await p.goto('http://localhost:8080/host.html',{waitUntil:'networkidle2'})
await new Promise(r=>setTimeout(r,2200))
const F = () => p.frames().find(x=>x.url().includes('lumina-library-preview'))
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const ev = (fn,...args)=>F().evaluate(fn,...args)

// login admin
await ev(()=>{ const a=Array.from(document.querySelectorAll('a')).find(a=>a.innerText.includes('Sign in')); a?.click() })
await sleep(1200)
await ev(()=>{ const btn=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Enter Administrator demo')); btn?.click() })
await sleep(2200)
console.log('dashboard:', (await ev(()=>document.body.innerText)).toLowerCase().includes('administrator overview'))

// books page via sidebar link
await ev(()=>{ const a=Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='#/app/books'); a?.click() })
await sleep(1600)
console.log('books page:', (await ev(()=>document.body.innerText)).includes('Book inventory'))

// open add-book dialog and fill
await ev(()=>{ const btn=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Add book'); btn?.click() })
await sleep(900)
const fill = async (sel,val)=>{ await ev((s,v)=>{ const el=document.querySelector(s); if(!el) return; const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})) },sel,val); await sleep(150) }
await fill('#book-form input[name="title"]','Sandbox Proof Title')
await fill('#book-form input[name="author"]','QA Bot')
await fill('#book-form input[name="publisher"]','Inline Press')
await fill('#book-form input[name="shelf"]','SB-01')
await fill('#book-form input[name="totalCopies"]','2')
await sleep(300)
const dialogBtn = await ev(()=>{ const d=document.querySelector('[role=dialog]'); const btn=Array.from(d.querySelectorAll('button')).find(b=>b.innerText.includes('Add book')); if(btn){btn.click(); return btn.innerText} return null })
await sleep(2000)
const body = await ev(()=>document.body.innerText)
console.log('submit button:', dialogBtn)
console.log('toast success:', body.includes('Book added to catalogue'))
console.log('title present in table:', body.includes('Sandbox Proof Title'))
await p.screenshot({path:'/home/user/qa-screens/bundle-books-after-add.png'})

// verify issue flow with careful combobox handling
await ev(()=>{ const a=Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='#/app/loans'); a?.click() })
await sleep(1600)
await ev(()=>{ const btn=Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Issue book')); btn?.click() })
await sleep(1000)
const pickCombo = async (index, term, expected) => {
  const opened = await ev((i)=>{ const cbs=document.querySelectorAll('button[role=combobox]'); const cb=cbs[i]; if(!cb) return false; cb.click(); return true }, index)
  await sleep(500)
  await ev((t)=>{ const input=document.querySelector('input[aria-label^="Search"]'); if(!input) return; const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(input,t); input.dispatchEvent(new Event('input',{bubbles:true})) }, term)
  await sleep(700)
  const chosen = await ev((label)=>{ const opts=Array.from(document.querySelectorAll('[role=option], ul li button')); const opt=opts.find(o=>(o.innerText||'').includes(label)); if(opt){opt.click(); return true} return false }, expected)
  await sleep(600)
  return opened && chosen
}
const m = await pickCombo(0,'Sneha','Sneha Iyer')
const bk = await pickCombo(1,'Sandbox Proof','Sandbox Proof Title')
console.log('member picked:', m, '| book picked:', bk)
const state = await ev(()=>{ const d=document.querySelector('[role=dialog]'); return d ? d.innerText : 'no dialog' })
console.log('dialog now shows book:', state.includes('Sandbox Proof Title'))
await ev(()=>{ const d=document.querySelector('[role=dialog]'); const btn=Array.from(d.querySelectorAll('button')).find(b=>b.innerText.includes('Issue book')); if(btn && !btn.disabled) btn.click() })
await sleep(2200)
const after = await ev(()=>document.body.innerText)
console.log('issue success toast:', after.includes('Book issued successfully'))
await p.screenshot({path:'/home/user/qa-screens/bundle-issue-after.png'})
await b.close()
