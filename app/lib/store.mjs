import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,scryptSync,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {mergeSummerCatalog} from './camp-catalog.mjs';
export const uid=()=>randomUUID();
export const hashToken=s=>createHash('sha256').update(s).digest('hex');
export function hashPassword(value){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(value,salt,64).toString('hex')}
export function checkPassword(value,hash){const [salt,key]=hash.split(':');return timingSafeEqual(scryptSync(value,salt,64),Buffer.from(key,'hex'))}
export function openStore(dir){
 mkdirSync(dir,{recursive:true});const db=new DatabaseSync(join(dir,'planner.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);');
 const store={db,list(kind){return db.prepare('SELECT data FROM records WHERE kind=?').all(kind).map(x=>JSON.parse(x.data))},get(kind,id){const r=db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.data):null},put(kind,id,data){db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,id,JSON.stringify(data));return data},remove(kind,id){db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id)},users(){return db.prepare('SELECT id,username,name,role FROM users ORDER BY name').all()},user(id){return db.prepare('SELECT id,username,name,role FROM users WHERE id=?').get(id)},createUser({username,name,role,password}){const id=uid();db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id,username,name,role,hashPassword(password));return this.user(id)},session(userId){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token),userId,Date.now()+8*3600000);return token},resolve(token){if(!token)return null;const s=db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(hashToken(token),Date.now());return s?this.user(s.user_id):null},close(){db.close()}};
 if(!store.get('library','main'))store.put('library','main',JSON.parse(readFileSync(new URL('../seed/library.json',import.meta.url),'utf8')));
 const library=store.get('library','main');
 if(!library.gesp){mkdirSync(join(dir,'backups'),{recursive:true});const backup=join(dir,'backups','library-before-multi-exam.json');if(!existsSync(backup))writeFileSync(backup,JSON.stringify(library,null,2),{flag:'wx'});library.gesp=JSON.parse(readFileSync(new URL('../../data/standards/gesp/course-mapping.json',import.meta.url),'utf8'));store.put('library','main',library);}
 const summer=mergeSummerCatalog(library);
 if(summer.changed){mkdirSync(join(dir,'backups'),{recursive:true});const backup=join(dir,'backups','library-before-summer-2026-10-22.json');if(!existsSync(backup))writeFileSync(backup,JSON.stringify(library,null,2),{flag:'wx'});store.put('library','main',summer.library);}
 return store;
}
