import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),origin:vi.fn(),db:vi.fn(),body:vi.fn(),enrich:vi.fn()}));
vi.mock('$lib/server/rehab-auth',()=>({requireUser:m.auth,sameOrigin:m.origin,authClient:m.db,readJson:m.body}));
vi.mock('$lib/server/dealmachine',()=>({enrichReady:m.enrich}));
vi.mock('$env/dynamic/private',()=>({env:{}}));
import {GET,POST} from './+server';
const event={} as Parameters<typeof GET>[0];
beforeEach(()=>vi.resetAllMocks());
it('blocks private enrichment reads before database access',async()=>{
 m.auth.mockRejectedValue({status:401});await expect(GET(event)).rejects.toMatchObject({status:401});expect(m.db).not.toHaveBeenCalled();
});
it('blocks cross-origin changes before authentication and writes',async()=>{
 m.origin.mockImplementation(()=>{throw{status:403};});await expect(POST(event)).rejects.toMatchObject({status:403});expect(m.auth).not.toHaveBeenCalled();expect(m.enrich).not.toHaveBeenCalled();
});
it('blocks unauthenticated processing',async()=>{
 m.auth.mockRejectedValue({status:401});await expect(POST(event)).rejects.toMatchObject({status:401});expect(m.enrich).not.toHaveBeenCalled();
});
