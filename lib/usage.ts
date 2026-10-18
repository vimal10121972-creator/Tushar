import {createHash} from 'node:crypto';
import {query} from './db';

export class HttpError extends Error {
 constructor(public status:number,message:string,public code?:string){super(message);}
}

export async function limit(key:string,max:number,seconds=86400,fixedBucket?:string){
 const bucket=fixedBucket??Math.floor(Date.now()/(seconds*1000));
 const digest=createHash('sha256').update(key+':'+bucket).digest('hex');
 const rows=await query(`INSERT INTO research.rate_limits(key,count,expires_at) VALUES($1,1,now()+($2::text||' seconds')::interval)
 ON CONFLICT(key) DO UPDATE SET count=research.rate_limits.count+1 RETURNING count`,[digest,seconds]);
 if(rows[0].count>max)throw new HttpError(429,'The free usage allowance has been reached. Please try again later.','QUOTA_REACHED');
}
