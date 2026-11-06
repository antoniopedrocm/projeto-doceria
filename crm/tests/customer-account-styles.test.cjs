const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const postcss=require('../node_modules/postcss'),parseSelector=require('../node_modules/postcss-selector-parser');
test('account styles stay scoped to Customer Self, with only the approved temporary order wrapping exception',()=>{
 const css=postcss.parse(fs.readFileSync(path.join(__dirname,'../src/customer/customerAccount.css'),'utf8'));
 let rules=0,temporaryWrapRules=0;css.walkRules(rule=>{
  rules++;
  // a4a5cdfe already approved this exact overflow fix for temporary SMS history.
  // No other order/container styles are admitted by this exception.
  if(rule.selector==='.customer-phone-orders [data-profile] .customer-panel'){
   temporaryWrapRules++;assert.deepEqual(rule.nodes.map(node=>{assert.equal(node.type,'decl');return [node.prop,node.value];}),[['overflow-wrap','anywhere']]);return;
  }
  parseSelector(root=>root.each(selector=>{const value=selector.toString().trim();assert.ok(value.startsWith('.customer-self-account [data-profile] ') || value==='.customer-self-account [data-message]:empty',rule.selector);})).processSync(rule.selector);
 });
 assert.equal(temporaryWrapRules,1);
 assert.ok(rules>20);assert.equal(css.nodes.filter(node=>node.type==='atrule' && /import|font-face/.test(node.name)).length,0);
});
