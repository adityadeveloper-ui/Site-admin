/* ---- page parser (runs in the browser, same logic as the edge function) ---- */
function arr(x){return Array.isArray(x)?x:x==null?[]:[x]}
function clean(s){return String(s==null?'':s).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;|&#34;/g,'"').replace(/&#39;|&rsquo;/g,"'").replace(/\s+/g,' ').trim()}
function meta(h,k){var m=h.match(new RegExp('<meta[^>]+(?:property|name)=["\']'+k+'["\'][^>]+content=["\']([^"\']*)','i'));return m?clean(m[1]):''}
function bigImg(u){return String(u).replace(/\{@width\}|\{@height\}/g,'800').replace(/\{@quality\}/g,'80').replace(/\/\d+\/\d+\//,'/832/832/').replace(/\?q=\d+$/,'')}
function parsePage(html,url){var ld=null,re=/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,m;
 while((m=re.exec(html))){try{var j=JSON.parse(m[1]);var hit=arr(j['@graph']||j).reduce(function(a,b){return a.concat(arr(b))},[]).filter(function(o){return o&&/Product/i.test(arr(o['@type']).join())})[0];if(hit){ld=hit;break}}catch(e){}}
 ld=ld||{};var offer=arr(ld.offers)[0]||{},imgs=arr(ld.image).map(function(x){return typeof x=='string'?x:x&&x.url}).concat([meta(html,'og:image')]).filter(Boolean).map(bigImg);
 var amz=html.match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/),hl=[],fk=html.match(/"highlights"\s*:\s*\[((?:"[^"]*",?\s*)+)\]/);
 if(fk){try{hl=JSON.parse('['+fk[1].replace(/,\s*$/,'')+']').map(clean)}catch(e){}}
 if(!hl.length){var fb=html.match(/id="feature-bullets"[\s\S]*?<\/ul>/);if(fb){var r2=/a-list-item[^>]*>([\s\S]*?)<\/span>/g,x;while((x=r2.exec(fb[0])))if(clean(x[1]))hl.push(clean(x[1]))}}
 var mrp=html.match(/"(?:mrp|originalPrice|maxRetailPrice)"\s*:\s*\{?[^}\d]{0,40}?(\d[\d,]*)/i),rt=ld.aggregateRating||{};
 return{n:clean(ld.name||(amz&&amz[1])||meta(html,'og:title')),i:imgs.filter(function(v,k){return imgs.indexOf(v)==k}).slice(0,12),d:clean(ld.description||meta(html,'og:description')),
 p:Number(String(offer.price!=null?offer.price:offer.lowPrice||'').replace(/,/g,''))||0,m:mrp?Number(mrp[1].replace(/,/g,'')):0,r:Number(rt.ratingValue)||0,rc:Number(rt.ratingCount||rt.reviewCount)||0,hl:hl.slice(0,10),
 rv:arr(ld.review).slice(0,20).map(function(v){return{s:Number(v.reviewRating&&v.reviewRating.ratingValue)||5,t:clean(v.name),d:clean(v.reviewBody),u:clean(v.author&&v.author.name||v.author)||'Customer'}}),src:url}}

/* ---- deep reviews: reads the shop's own embedded data, follows review pages ---- */
function getState(h){var m=h.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);if(!m)return null;try{return JSON.parse(m[1])}catch(e){return null}}
function isImg(s){return typeof s=='string'&&/^https?:\/\//.test(s)&&/(flixcart|rukminim|fkcdn|\.(jpe?g|png|webp))/i.test(s)}
function imgsIn(o,d){var a=[];d=d||0;if(d>4||o==null)return a;if(isImg(o))return [bigImg(o)];if(Array.isArray(o)){o.forEach(function(x){a=a.concat(imgsIn(x,d+1))})}else if(typeof o=='object'){Object.keys(o).forEach(function(k){a=a.concat(imgsIn(o[k],d+1))})}return a}
function pick(o,ks){for(var i=0;i<ks.length;i++){var v=o[ks[i]];if(v!=null&&v!=='')return v}}
function walkState(st,out){var seen=new Set();(function w(o,k){if(!o||typeof o!='object'||seen.has(o))return;seen.add(o);
 if(!Array.isArray(o)){var txt=pick(o,['reviewText','reviewBody','text','comment','review','description']),rt=pick(o,['rating','ratingValue','stars','overallRating']);
  if(rt&&typeof rt=='object')rt=rt.value||rt.rating;rt=Number(rt);
  if(typeof txt=='string'&&txt.length>=3&&rt>=1&&rt<=5){var ph=[];Object.keys(o).forEach(function(x){if(/image|photo|media|img|pic/i.test(x))ph=ph.concat(imgsIn(o[x]))});
   var au=pick(o,['author','authorName','userName','reviewer','name']);if(au&&typeof au=='object')au=au.name;var lc=Number(pick(o,['helpfulCount','upvotes','upvote','likes','helpful']))||0;
   out.rv.push({s:Math.round(rt),t:clean(pick(o,['title','reviewTitle','headline'])||''),d:clean(txt),u:clean(au||'Customer'),l:lc,x:0,ph:ph.filter(function(v,i){return ph.indexOf(v)==i}).slice(0,6)})}}
 else if(o.length>=3&&/aspect|attribute|feature|parameter/i.test(k||'')){var as=o.map(function(it){if(!it||typeof it!='object')return null;var n=pick(it,['name','title','label','aspect']),v=Number(pick(it,['value','rating','score','averageRating']));return typeof n=='string'&&v>=1&&v<=5?[clean(n),Math.round(v*10)/10]:null}).filter(Boolean);if(as.length>=3&&!out.asp.length)out.asp=as}
 Object.keys(o).forEach(function(x){w(o[x],x)})})(st,'')}
function reviewsUrl(u,pg){var m=u.match(/^(https?:\/\/[^/]*flipkart\.com\/[^/]+)\/p\/(itm\w+)([^#]*)/i);if(!m)return null;var q=m[3]||'';return m[1]+'/product-reviews/'+m[2]+q+(q.indexOf('?')<0?'?':'&')+'page='+pg}
function deep(url,fetchHtml,html0,max){var out={rv:[],asp:[],rp:[]},pg=1;
 function absorb(h){var st=getState(h);if(st)walkState(st,out)}
 function finish(){var s={},rv=[];out.rv.forEach(function(v){var k=v.d.slice(0,60);if(!s[k]){s[k]=1;rv.push(v)}});out.rv=rv;var rp=[];rv.forEach(function(v){rp=rp.concat(v.ph)});out.rp=rp.filter(function(v,i){return rp.indexOf(v)==i}).slice(0,40);return out}
 absorb(html0||'');
 function next(){if(pg>max||!reviewsUrl(url,pg))return Promise.resolve(finish());var before=out.rv.length;
  return fetchHtml(reviewsUrl(url,pg)).then(function(h){absorb(h);pg++;return out.rv.length>before?next():finish()}).catch(function(){return finish()})}
 return next()}

var UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
function getHtml(u){return fetch(u,{redirect:'follow',headers:{'user-agent':UA,'accept-language':'en-IN,en;q=0.9','accept':'text/html,application/xhtml+xml'}}).then(function(r){return r.text().then(function(t){return{text:t,url:r.url||u,status:r.status}})})}
module.exports=function(req,res){
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');
 var u=String((req.query&&req.query.url)||'');if(!/^https?:\/\//i.test(u))return res.status(400).json({error:'Valid link required'});
 getHtml(u).then(function(g){var j=parsePage(g.text,g.url);if(!j.n)return res.status(422).json({error:'Shop did not return the product page (status '+g.status+').'});
  return deep(g.url,function(x){return getHtml(x).then(function(y){return y.text})},g.text,5).then(function(dp){if(dp.rv.length>j.rv.length)j.rv=dp.rv;j.rp=dp.rp;j.asp=dp.asp;j.rn=j.rv.length;j.src=g.url;res.status(200).json(j)})})
 .catch(function(e){res.status(500).json({error:String(e&&e.message||e)})})};
