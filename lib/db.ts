import { neon } from '@neondatabase/serverless';
export function db() {
 if (!process.env.DATABASE_URL) throw new Error('Database is not configured.');
 return neon(process.env.DATABASE_URL);
}
export async function query(text:string, values:unknown[]=[]):Promise<any[]> {
 return await db().query(text,values,{fetchOptions:{signal:AbortSignal.timeout(15000)}}) as any[];
}
