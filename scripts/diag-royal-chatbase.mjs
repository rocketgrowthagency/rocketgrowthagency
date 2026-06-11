// Quick test: load Royal Moving in mobile-emulated puppeteer (same flow as
// step-2.5 auditMobile) and dump all script src tags + iframe src tags so
// we can see whether Chatbase is actually loaded or stripped by bot
// detection.
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('user-agent-override');
puppeteer.use(stealth);

const PROFILE = path.join(process.cwd(), 'output', 'chrome-profile-step3');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  headless: false,
  executablePath: CHROME,
  userDataDir: PROFILE,
  defaultViewport: null,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.setUserAgent(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
);

await page.goto('https://royalmovingco.com/los-angeles/marina-del-rey-movers/', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await new Promise(r => setTimeout(r, 4000));

const dump = await page.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src'));
  const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
    id: f.id, className: f.className, src: f.getAttribute('src') || '',
  }));
  // Also look for any div/button/element with chat-related classes/ids
  const chatish = Array.from(document.querySelectorAll('[class*="chat" i], [id*="chat" i]')).slice(0, 10).map(el => ({
    tag: el.tagName, id: el.id, className: typeof el.className === 'string' ? el.className : '(SVG)',
  }));
  return { scripts, iframes, chatish, totalScripts: scripts.length, totalIframes: iframes.length };
});

console.log('=== Total scripts:', dump.totalScripts);
console.log('=== Total iframes:', dump.totalIframes);
console.log('\n=== Scripts containing chat/bot/widget ===');
const interesting = dump.scripts.filter(s => /chat|bot|widget|launcher|messenger|drift|tawk|intercom|crisp|tidio/i.test(s));
console.log(interesting.length ? interesting : '(none)');
console.log('\n=== All iframes ===');
console.log(JSON.stringify(dump.iframes, null, 2));
console.log('\n=== Elements with chat-ish class/id ===');
console.log(JSON.stringify(dump.chatish, null, 2));

await browser.close();
