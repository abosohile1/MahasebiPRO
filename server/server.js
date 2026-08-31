'use strict';
const express=require('express');
const cors=require('cors');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const initSqlJs=require('sql.js');

const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||'0.0.0.0';
const DATA_DIR=path.join(__dirname,'data');
const DB_FILE=path.join(DATA_DIR,'mahasebi-server.sqlite');
const SECRET=process.env.MAHASEBI_SECRET||'';
if(!SECRET || SECRET.length<32) throw new Error('MAHASEBI_SECRET must be set and contain at least 32 characters.');
fs.mkdirSync(DATA_DIR,{recursive:true});

function hashPassword(password){return crypto.createHash('sha256').update(String(password)).digest('hex');}
function tokenFor(user){const body=Buffer.from(JSON.stringify({u:user.username,r:user.role,p:user.permissions||{},iat:Date.now()})).toString('base64url');const sig=crypto.createHmac('sha256',SECRET).update(body).digest('base64url');return body+'.'+sig;}
function verifyToken(t){try{const [body,sig]=String(t||'').split('.');if(!body||!sig)return null;const good=crypto.createHmac('sha256',SECRET).update(body).digest('base64url');if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(good)))return null;const p=JSON.parse(Buffer.from(body,'base64url').toString());if(Date.now()-p.iat>1000*60*60*24*30)return null;return p;}catch{return null}}
function auth(req,res,next){const p=verifyToken((req.headers.authorization||'').replace(/^Bearer\s+/i,''));if(!p)return res.status(401).json({error:'UNAUTHORIZED'});req.user=p;next();}

(async()=>{
 const SQL=await initSqlJs();
 let database;
 if(fs.existsSync(DB_FILE)) database=new SQL.Database(fs.readFileSync(DB_FILE)); else database=new SQL.Database();
 database.run(`CREATE TABLE IF NOT EXISTS app_state(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);`);
 database.run(`CREATE TABLE IF NOT EXISTS change_log(revision INTEGER PRIMARY KEY, touched TEXT NOT NULL, created_at TEXT NOT NULL);`);
 database.run(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, permissions TEXT NOT NULL DEFAULT '{}');`);
 const existing=database.exec('SELECT COUNT(*) AS c FROM users');
 if(!existing[0]?.values[0]?.[0]) database.run('INSERT INTO users(id,username,password_hash,role,active,permissions) VALUES(?,?,?,?,?,?)',['admin','admin',hashPassword('ChangeMeNow_123'),'admin',1,'{}']);
 function persist(){fs.writeFileSync(DB_FILE,Buffer.from(database.export()));}
 function getStateRow(){const r=database.exec('SELECT json,revision,updated_at FROM app_state WHERE id=1');const x=r[0]?.values[0];return x?{state:JSON.parse(x[0]),revision:Number(x[1]||0),updatedAt:x[2]}:null}
 function getState(){return getStateRow()?.state||null}
 function setState(state){const json=JSON.stringify(state||{});database.run('INSERT INTO app_state(id,json,revision,updated_at) VALUES(1,?,0,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at',[json,new Date().toISOString()]);persist()}
 function users(){const r=database.exec('SELECT id,username,role,active,permissions FROM users ORDER BY role DESC, username');return (r[0]?.values||[]).map(x=>({id:x[0],username:x[1],role:x[2],active:Number(x[3]),permissions:JSON.parse(x[4]||'{}')}))}
 const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');next();});
app.use(cors({origin:true,credentials:false}));
app.use(express.json({limit:'25mb'}));
const loginAttempts=new Map();
function loginGuard(req,res,next){const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();const now=Date.now();let x=loginAttempts.get(ip);if(!x||now-x.windowStart>15*60*1000)x={windowStart:now,count:0};x.count++;loginAttempts.set(ip,x);if(x.count>20)return res.status(429).json({error:'محاولات تسجيل الدخول كثيرة، حاول لاحقًا'});next();}
app.use('/api/auth/login',loginGuard);
 app.get('/health',(req,res)=>res.json({ok:true,service:'mahasebi-phone-server',time:new Date().toISOString()}));
 app.post('/api/auth/login',(req,res)=>{const username=String(req.body?.username||'').trim();const ph=hashPassword(req.body?.password||'');const r=database.exec('SELECT id,username,role,active,permissions,password_hash FROM users WHERE lower(username)=lower(?) LIMIT 1',[username]);const x=r[0]?.values[0];if(!x||Number(x[3])===0||x[5]!==ph)return res.status(401).json({error:'اسم المستخدم أو كلمة المرور غير صحيحة'});res.json({token:tokenFor({username:x[1],role:x[2],permissions:JSON.parse(x[4]||'{}')}),user:{id:x[0],username:x[1],role:x[2],active:Number(x[3]),permissions:JSON.parse(x[4]||'{}')}})});
 app.get('/api/state',auth,(req,res)=>{const row=getStateRow();res.json({state:row?.state||null,revision:row?.revision||0,updatedAt:row?.updatedAt||null})});
 app.put('/api/state',auth,(req,res)=>{if(req.user.r!=='admin')return res.status(403).json({error:'FORBIDDEN'});setState(req.body?.state||{});res.json({ok:true,revision:getStateRow()?.revision||0,updatedAt:new Date().toISOString()})});
 function clone(x){return JSON.parse(JSON.stringify(x));}
 function entityMap(v){return Array.isArray(v)&&v.every(x=>x&&typeof x==='object'&&x.id!=null)?new Map(v.map(x=>[String(x.id),x])):null}
 function applyOp(state,op){const field=String(op.field||''); if(!field)return; if(op.kind==='set'){state[field]=clone(op.value);return;} if(!Array.isArray(state[field]))state[field]=[]; const arr=state[field]; const id=String(op.id||''); const i=arr.findIndex(x=>String(x?.id)===id); if(op.kind==='upsert'){if(i>=0)arr[i]=clone(op.value);else arr.push(clone(op.value));} else if(op.kind==='delete'&&i>=0)arr.splice(i,1);}
 app.post('/api/sync/push',auth,(req,res)=>{const row=getStateRow(); if(!row)return res.status(409).json({error:'NO_SERVER_STATE',revision:0,state:null}); const base=Number(req.body?.baseRevision); const ops=Array.isArray(req.body?.operations)?req.body.operations:[]; if(!Number.isInteger(base)||base<0)return res.status(400).json({error:'INVALID_REVISION'}); const current=row.revision; if(base>current)return res.status(409).json({error:'REVISION_AHEAD',revision:current,state:row.state});
   if(base<current){const since=database.exec('SELECT touched FROM change_log WHERE revision>? ORDER BY revision',[base]);const touched=new Set();for(const r of (since[0]?.values||[])){try{for(const k of JSON.parse(r[0]||'[]'))touched.add(k)}catch{}} const conflict=ops.some(o=>touched.has(String(o.field||'')+':'+String(o.id||'*')) || (o.kind==='set'&&touched.has(String(o.field||'')+':*'))); if(conflict)return res.status(409).json({error:'CONFLICT',revision:current,state:row.state});}
   const allowed=new Set(['sales','purchases','products','stockCycle','lowstock','customers','suppliers','expenses','cash','reports','dataDelete','settings','backup']); const privateFields=new Set(['privateInfo']); if(req.user.r!=='admin'){for(const op of ops){const f=String(op.field||''); if(!allowed.has(f)||f==='settings'&&!req.user.p?.settings||f==='backup'&&!req.user.p?.backup||f==='dataDelete'&&!req.user.p?.dataDelete||f==='reports'&&!req.user.p?.reports)return res.status(403).json({error:'FORBIDDEN_PERMISSION',field:f});}} const state=clone(row.state);const touched=[];for(const op of ops){applyOp(state,op);touched.push(String(op.field||'')+':'+(op.kind==='set'?'*':String(op.id||'')));} const next=current+(ops.length?1:0); if(ops.length){database.run('UPDATE app_state SET json=?,revision=?,updated_at=? WHERE id=1',[JSON.stringify(state),next,new Date().toISOString()]);database.run('INSERT INTO change_log(revision,touched,created_at) VALUES(?,?,?)',[next,JSON.stringify(touched),new Date().toISOString()]);persist();} res.json({ok:true,revision:next,state,applied:ops.length});
 });
 app.post('/api/sync/bootstrap',auth,(req,res)=>{if(req.user.r!=='admin')return res.status(403).json({error:'FORBIDDEN'});if(getStateRow())return res.status(409).json({error:'ALREADY_INITIALIZED'});setState(req.body?.state||{});res.json({ok:true,revision:0,state:getState()})});
 app.get('/api/auth/users',(req,res)=>{const r=database.exec("SELECT username FROM users WHERE role!='admin' AND active=1 ORDER BY username");res.json({users:(r[0]?.values||[]).map(x=>({username:x[0]}))})});
 app.get('/api/users',auth,(req,res)=>{if(req.user.r!=='admin')return res.status(403).json({error:'FORBIDDEN'});res.json({users:users()})});
 app.post('/api/users',auth,(req,res)=>{if(req.user.r!=='admin')return res.status(403).json({error:'FORBIDDEN'});const b=req.body||{};const username=String(b.username||'').trim();if(username.length<2)return res.status(400).json({error:'اسم المستخدم قصير'});const id=b.id||('u-'+crypto.randomUUID());try{database.run('INSERT INTO users(id,username,password_hash,role,active,permissions) VALUES(?,?,?,?,?,?)',[id,username,hashPassword(b.password||''), 'user',b.active===0?0:1,JSON.stringify(b.permissions||{})]);persist();res.json({ok:true,user:users().find(x=>x.id===id)})}catch(e){res.status(409).json({error:'اسم المستخدم موجود مسبقًا'})}});
 app.put('/api/users/:id',auth,(req,res)=>{if(req.user.r!=='admin')return res.status(403).json({error:'FORBIDDEN'});const b=req.body||{};const id=req.params.id;const old=database.exec('SELECT id,username,role,password_hash,active,permissions FROM users WHERE id=?',[id]);if(!old[0]?.values[0])return res.status(404).json({error:'الحساب غير موجود'});const x=old[0].values[0];const username=String(b.username||x[1]).trim();const ph=b.password?hashPassword(b.password):x[3];database.run('UPDATE users SET username=?,password_hash=?,active=?,permissions=? WHERE id=?',[username,ph,x[2]==='admin'?1:(b.active===0?0:1),JSON.stringify(b.permissions||JSON.parse(x[5]||'{}')),id]);persist();res.json({ok:true})});
 app.delete('/api/users/:id',auth,(req,res)=>{if(req.user.r!=='admin')return res.status(403).json({error:'FORBIDDEN'});const id=req.params.id;if(id==='admin')return res.status(400).json({error:'لا يمكن حذف المدير'});database.run('DELETE FROM users WHERE id=?',[id]);persist();res.json({ok:true})});
 app.get('/api/config',(req,res)=>res.json({apiVersion:1,service:'mahasebi-phone-server',httpsRequired:true}));
 app.use(express.static(path.join(__dirname,'../client/public')));
 app.listen(PORT,HOST,()=>console.log(`Mahasebi Phone Server listening on http://${HOST}:${PORT}`));
})();
