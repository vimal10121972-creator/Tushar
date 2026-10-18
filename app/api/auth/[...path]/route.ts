import {auth} from '@/lib/auth-server';
import {allowedEmail,HttpError,limit} from '@/lib/access';
export const dynamic='force-dynamic';
const handlers=auth.handler();
export const GET=handlers.GET;
export async function POST(req:Request, context:{params:Promise<{path:string[]}>}){
 try{
  const path=new URL(req.url).pathname;
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  await limit('auth:'+ip,80,3600);
  if(path.endsWith('/sign-up/email')){
   const body=await req.clone().json();
   if(typeof body.email!=='string'||!await allowedEmail(body.email.toLowerCase())) return Response.json({message:'Registration is invite-only. Ask Tushar Jain for an invitation.',code:'INVITE_REQUIRED'},{status:403});
  }
  return handlers.POST(req,context);
 }catch(e){console.error('auth-request',e instanceof Error?e.name:'error');return Response.json({message:e instanceof HttpError?e.message:'Authentication is temporarily unavailable.'},{status:e instanceof HttpError?e.status:503});}
}
