const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const postcss=require('../node_modules/postcss'),parseSelector=require('../node_modules/postcss-selector-parser');
test('all account presentation selectors require Customer Self host and profile screen; no global/admin/order selectors',()=>{
 const css=postcss.parse(fs.readFileSync(path.join(__dirname,'../src/customer/customerAccount.css'),'utf8'));
 let rules=0;css.walkRules(rule=>{rules++;parseSelector(root=>root.each(selector=>{const value=selector.toString().trim();assert.ok(value.startsWith('.customer-self-account [data-profile] ') || value==='.customer-self-account [data-message]:empty',rule.selector);})).processSync(rule.selector);});
 assert.ok(rules>20);assert.equal(css.nodes.filter(node=>node.type==='atrule' && /import|font-face/.test(node.name)).length,0);
});
