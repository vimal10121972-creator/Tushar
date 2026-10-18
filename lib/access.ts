import { auth } from './auth-server';
import { query } from './db';
import {HttpError} from './usage';
export {HttpError,limit} from './usage';
export const ownerEmail=()=>process.env.OWNER_EMAIL?.trim().toLowerCase();
export async function allowedEmail(email:string) {
 if(email===ownerEmail()) return true;
 const rows=await query('SELECT email FROM research.invites WHERE email=$1 AND expires_at>now() UNION SELECT email FROM research.members WHERE email=$1 AND active=true',[email]);
 return rows.length>0;
}
export async function member() {
 const {data:session}=await auth.getSession();
 if(!session?.user) throw new HttpError(401,'Please sign in to continue.');
 const u=session.user;
 if(!u.emailVerified) throw new HttpError(403,'Verify your email with the code from Neon Auth to access research.','EMAIL_UNVERIFIED');
 const email=u.email.toLowerCase();
 if(!await allowedEmail(email)) throw new HttpError(403,'This workspace is invite-only. Ask the owner for access.','INVITE_REQUIRED');
 const role=email===ownerEmail()?'OWNER':'MEMBER';
 const rows=await query(`INSERT INTO research.members(user_id,email,name,role) VALUES($1,$2,$3,$4)
 ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name RETURNING *`,[u.id,email,u.name||email,role]);
 if(!rows[0].active) throw new HttpError(403,'Your access has been disabled.');
 return {id:rows[0].user_id,email:rows[0].email,name:rows[0].name,role:rows[0].role};
}
export function requireOwner(u:{role:string}) {if(u.role!=='OWNER')throw new HttpError(403,'Owner access required.');}
export function validateOrigin(req:Request){
 const origin=req.headers.get('origin');
 const allowed=process.env.APP_URL;
 if(!origin || (origin!==allowed && origin!==new URL(req.url).origin)) throw new HttpError(403,'Invalid request origin.');
}
export async function readableReport(id:string,u:{id:string,email:string}){
 if(!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404,'Report not found.');
 const r=await query(`SELECT r.* FROM research.reports r WHERE r.id=$1 AND (r.user_id=$2 OR EXISTS(SELECT 1 FROM research.shares s WHERE s.report_id=r.id AND s.email=$3))`,[id,u.id,u.email]);
 if(!r[0]) throw new HttpError(404,'Report not found.');
 return r[0];
}
export function cleanReport(r:any){const {pdf_base64,lease_token,lease_until,payload,...clean}=r; return {...clean,stage:r.stage_name,stageIndex:r.stage,pdfAvailable:!!pdf_base64};}
