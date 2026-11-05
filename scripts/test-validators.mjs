// Name and password rules (public/js/validators.js): node scripts/test-validators.mjs
import V from '../public/js/validators.js';
let fails=0; const ck=(n,ok)=>{console.log((ok?'PASS':'FAIL')+'  '+n); if(!ok) fails++;};
for (const n of ['Ma. Theresa Dela Cruz','Juan-Carlos Niño',"D'Souza",'Jose Rizal Jr.','José Ma. Sto. Tomas','O’Connor','  Ana   Cruz  ','Nguyễn Văn An','Li','Juan Dela Cruz III'])
  ck('name ok: '+n, V.validateFullName(n).ok);
for (const [n,c] of [['John2 Doe','digits'],['J','short'],['--','chars'],['Ana  .','chars'],['Ana@Cruz','chars'],['','empty'],['A'.repeat(61),'long'],["Ana''Cruz",'chars'],['.Ana','chars'],['Ana-','chars']])
  { const r=V.validateFullName(n); ck(`name fail (${c}): ${JSON.stringify(n)} -> ${r.code}`, !r.ok && r.code===c); }
ck('tidies spaces', V.validateFullName('  Ana   Cruz ').value==='Ana Cruz');
ck('tl message', /numero/.test(V.validateFullName('Ana2','tl').message));
for (const p of ['Calzada#2026','Abcdefg1!','Pa$$w0rdX','Aa1~aaaa', 'Xy9_' + 'a'.repeat(60)]) ck('pw ok: '+p, V.validatePassword(p).ok && V.PASSWORD_RE.test(p));
for (const p of ['calzada#2026','Calzada2026','Calz#1','Calzada-2026','Calzada 2026!','CALZADA#2026','Calzada#', 'Xy9_' + 'a'.repeat(61)]) ck('pw fail: '+p, !V.validatePassword(p).ok && !V.PASSWORD_RE.test(p));
ck('missing lists rules', V.validatePassword('calzada2026').missing.join()==='upper,special');
ck('email as password', !V.validatePassword('Juan#2026x',{email:'juan#2026x@gmail.com'}).ok);
ck('message en', /uppercase letter/.test(V.validatePassword('calzada#2026').message));
ck('isEmail', V.isEmail('a@b.co') && !V.isEmail('a@b') && !V.isEmail('a b@c.d'));
console.log(fails?`\n${fails} failed`:'\nall passed'); process.exit(fails?1:0);
