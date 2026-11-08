// Offline layout/keyboard regression using the actual markup, CSS and UI script.
// Browser fixture deliberately does not load application scripts or call APIs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {JSDOM} = require('../node_modules/jsdom');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'doceria-guest-visual-tools/node_modules/playwright-core'));
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'docs/evidence/checkout-modal-responsive');
const source = fs.readFileSync(path.join(root, 'crm/public/cardapio.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'crm/public/checkout-modal-layout.js'), 'utf8');
const ownCss = fs.readFileSync(path.join(root, 'crm/public/checkout-modal.css'), 'utf8');
const postcss = require('../node_modules/postcss');
const tailwind = require('../node_modules/tailwindcss');
const scenarios = [
    ['iphone-small', 320, 568], ['iphone', 390, 800], ['android', 360, 740],
    ['landscape', 800, 360], ['tablet', 768, 1024], ['pc', 1920, 889], ['window', 640, 480],
    ...[100, 125, 150, 200].map(zoom => [`zoom-${zoom}`, Math.floor(1366 * 100 / zoom), Math.floor(768 * 100 / zoom)]),
    ['iphone-keyboard', 390, 800, 330, 65], ['android-keyboard', 360, 740, 300, 0],
];
(async () => {
    fs.mkdirSync(out, {recursive: true});
    // Public cardapio uses Tailwind CDN, not the CRM bundle's purged stylesheet.
    // Compile the actual public template offline so fixed/hidden/max-width utilities are present.
    const generated = await postcss([tailwind({content:[{raw:source, extension:'html'}]})]).process('@tailwind base; @tailwind components; @tailwind utilities;', {from:undefined});
    const inline = [...new JSDOM(source).window.document.querySelectorAll('style')].map(s => s.textContent.replace(/@import[^;]+;/g, '')).join('\n');
    const css = generated.css + '\n' + inline;
    const {syncPaymentChoices} = await import(pathToFileURL(path.join(root, 'crm/public/checkout-payment-choice.mjs')));
    const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
    const report = [];
    try {
        for (const [name, width, height, visualHeight = height, offsetTop = 0] of scenarios) {
            for (const mode of ['guest', 'strong', 'phone']) {
                const dom = new JSDOM(source), document = dom.window.document;
                const modal = document.getElementById(mode === 'guest' ? 'guest-checkout-modal' : 'payment-modal');
                const buttonId = mode === 'guest' ? 'send-whatsapp-button' : 'confirm-order-button';
                if (mode === 'guest') {
                    document.getElementById('guest-address-step1').classList.add('hidden');
                    document.getElementById('guest-address-step3').classList.remove('hidden');
                    document.getElementById('guest-payment-choice-help').textContent = 'Combine a forma de pagamento diretamente com a loja. O método será informado posteriormente.';
                } else {
                    syncPaymentChoices(document.getElementById('payment-method-select'), true, true);
                    document.getElementById('selected-address-text').textContent = 'Endereço sintético para teste de conteúdo longo — Rua de Teste, 123, Complemento, Goiânia';
                    document.getElementById('payment-discount-row').classList.remove('hidden');
                    document.getElementById('payment-cupom-message').textContent = 'Cupom sintético aplicado';
                    document.getElementById('payment-shipping').textContent = 'R$ 12,00';
                }
                const page = await browser.newPage({viewport: {width, height}, isMobile:width<=430, hasTouch:width<=430});
                const errors = []; let requests = 0;
                page.on('pageerror', error => errors.push(error.message));
                await page.route('**/*', route => { requests++; return route.abort(); });
                await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}\n${ownCss}</style></head><body style="margin:0"><button id="opener">Abrir checkout</button>${modal.outerHTML}<div id="toast" class="hidden"><p id="toast-message"></p></div></body></html>`);
                await page.evaluate(() => {
                    const viewport = new EventTarget(); viewport.height = window.innerHeight; viewport.offsetTop = 0;
                    Object.defineProperty(window, 'visualViewport', {value: viewport, configurable: true});
                });
                await page.addScriptTag({content: ui});
                await page.evaluate(() => {
                    document.getElementById('opener').focus();
                    document.querySelector('[data-checkout-dialog]').classList.remove('hidden');
                    document.querySelector('[aria-label="Fechar checkout"]').onclick = () => document.querySelector('[data-checkout-dialog]').classList.add('hidden');
                });
                await page.waitForTimeout(30);
                await page.evaluate(({visualHeight, offsetTop}) => {
                    window.visualViewport.height = visualHeight; window.visualViewport.offsetTop = offsetTop;
                    window.visualViewport.dispatchEvent(new Event('resize'));
                    window.visualViewport.dispatchEvent(new Event('scroll'));
                }, {visualHeight, offsetTop});
                const measure = () => page.evaluate(buttonId => {
                    const dialog = document.querySelector('[data-checkout-dialog]'), content = dialog.querySelector('.checkout-dialog-content');
                    const rect = node => {const r = node.getBoundingClientRect();return {top:r.top, bottom:r.bottom, left:r.left, right:r.right, height:r.height};};
                    return {panel:rect(dialog.firstElementChild), button:rect(document.getElementById(buttonId)), content:rect(content), horizontal:content.scrollWidth>content.clientWidth, pageWidth:document.documentElement.scrollWidth};
                }, buttonId);
                const initial = await measure();
                assert.ok(initial.button.bottom <= visualHeight + offsetTop + 1, JSON.stringify({name, mode, initial}));
                assert.ok(initial.button.top >= offsetTop && initial.content.height > 0);
                assert.ok(initial.button.top >= initial.content.bottom - 1);
                assert.ok(initial.panel.left >= 0 && initial.panel.right <= width + 1 && initial.pageWidth <= width);
                assert.ok(initial.panel.right-initial.panel.left <= (mode === 'guest' ? 672 : 384)+1, 'public max-width utilities must be present');
                assert.equal(initial.horizontal, false);
                await page.evaluate(() => {const c=document.querySelector('.checkout-dialog-content');c.scrollTop=c.scrollHeight;});
                assert.equal((await measure()).button.top, initial.button.top, 'footer must not scroll with content');
                await page.evaluate(buttonId => {window.fixtureClicks=0;document.getElementById(buttonId).addEventListener('click',()=>window.fixtureClicks++);}, buttonId);
                await page.locator('#'+buttonId).click();
                assert.equal(await page.evaluate(() => window.fixtureClicks), 1, 'action must be clickable without page scroll');
                await page.locator('#'+buttonId).focus(); await page.keyboard.press('Tab');
                assert.equal(await page.evaluate(() => document.activeElement.closest('.checkout-dialog-header') !== null), true);
                const input = mode === 'guest' ? '#guest-phone' : '#payment-cupom-input';
                await page.locator(input).focus();
                await page.waitForTimeout(30);
                const field = await page.locator(input).boundingBox(); const content = (await measure()).content;
                assert.ok(field.y >= content.top - 1 && field.y + field.height <= content.bottom + 1, 'focused input must be visible');
                await page.evaluate(buttonId => {const b=document.getElementById(buttonId);b.disabled=true;b.textContent='Processando...';document.getElementById('toast-message').textContent='Verifique os campos obrigatórios.';document.getElementById('toast').classList.remove('hidden');}, buttonId);
                await page.waitForTimeout(20);
                assert.equal(await page.locator('#'+buttonId).isDisabled(), true);
                assert.equal(await page.locator('.checkout-dialog-feedback').isVisible(), true);
                assert.ok((await measure()).button.bottom <= visualHeight + offsetTop + 1);
                if (['iphone','pc','landscape','iphone-keyboard'].includes(name) && mode !== 'phone') {
                    await page.screenshot({path:path.join(out, `${name}-${mode}.png`)});
                }
                await page.locator('[aria-label="Fechar checkout"]').focus(); await page.keyboard.press('Escape');
                assert.equal(await page.locator('[data-checkout-dialog]').isVisible(), false);
                assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
                assert.equal(await page.evaluate(() => document.body.style.overflow), '');
                assert.equal(requests, 0); assert.deepEqual(errors, []);
                report.push({name, mode, viewport:{width,height}, visualViewport:{height:visualHeight,offsetTop}, ...initial, result:'PASS'});
                await page.close(); dom.window.close();
            }
        }
    } finally { await browser.close(); }
    fs.writeFileSync(path.join(out, 'layout.json'), JSON.stringify({scope:'Offline synthetic Chromium layout. Zoom cases use equivalent CSS viewports; keyboard uses a VisualViewport resize/offset fixture. Not physical iOS/Safari or real native browser zoom certification.', cases:report.length, report}, null, 2)+'\n');
    console.log(JSON.stringify({cases:report.length, result:'PASS', remoteRequests:0, realOrders:0}));
})().catch(error => {console.error(error);process.exitCode=1;});
