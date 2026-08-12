import { chromium } from 'playwright'
import fs from 'fs'

// Renders public/og.png — the card WhatsApp shows when the link is shared.
// Carries both marks: GymFlow AI, and the studio it's configured for.
const slam =
  'data:image/png;base64,' + fs.readFileSync('public/img/slam-logo-dark.png').toString('base64')

const html = `
<div class="card">
  <div class="row">
    <div class="mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ef2b3c" stroke-width="2.4" stroke-linecap="round">
        <path d="M4 8v8M8 6v12M16 6v12M20 8v8M8 12h8"/>
      </svg>
    </div>
    <p class="brand">GymFlow<span>&nbsp;AI</span></p>
    <span class="sep"></span>
    <span class="for">Configured for</span>
    <img class="slam" src="${slam}" alt="SLAM Lifestyle and Fitness Studio">
  </div>
  <h1>The Smart Operating System<br>for <em>Modern Gyms</em></h1>
  <p class="sub">Live occupancy · AI member assistant · PT booking &amp; payments · InBody sync · GST billing</p>
  <div class="chips">
    <span><b>38</b> inside now</span><span><b>642</b> members</span><span><b>+18%</b> revenue</span>
  </div>
</div>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:#08080a;font-family:ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;
    background-image:radial-gradient(58% 62% at 10% -5%,rgba(239,43,60,.26) 0%,transparent 62%),
                     radial-gradient(46% 52% at 94% 14%,rgba(239,43,60,.14) 0%,transparent 66%);}
  .card{height:100%;display:flex;flex-direction:column;justify-content:center;gap:26px;padding:0 76px}
  .row{display:flex;align-items:center;gap:16px}
  .mark{width:52px;height:52px;display:grid;place-items:center;border-radius:15px;
    background:rgba(239,43,60,.15);box-shadow:inset 0 0 0 1px rgba(239,43,60,.4)}
  .mark svg{width:29px;height:29px}
  .brand{font-size:24px;font-weight:700;color:#fff;letter-spacing:-.03em}
  .brand span{color:#ef2b3c}
  .sep{width:1px;height:30px;background:rgba(255,255,255,.14)}
  .for{font-size:13px;color:#6f6f7d}
  .slam{height:34px;width:auto}
  h1{font-size:66px;line-height:1.05;font-weight:700;color:#fff;letter-spacing:-.045em}
  h1 em{font-style:normal;color:#ef2b3c}
  .sub{font-size:22px;color:#a1a1ad;letter-spacing:-.01em}
  .chips{display:flex;gap:12px;margin-top:6px}
  .chips span{font-size:19px;color:#d4d4dd;padding:11px 20px;border-radius:999px;
    background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09)}
  .chips b{color:#fff;font-weight:700}
</style>`

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html)
await page.waitForTimeout(400)
await page.screenshot({ path: 'public/og.png' })
await browser.close()
console.log('wrote public/og.png')
