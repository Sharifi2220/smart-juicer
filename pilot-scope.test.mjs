import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertPilotPathWithinRoot} from './pilot-scope.ts';
test('canonical path guard rejects prefix siblings and links, accepts contained files',()=>{
  const d=mkdtempSync(join(tmpdir(),'sj-pilot-scope-'));
  try{
    const root=join(d,'app'); const sibling=join(d,'app-data');
    mkdirSync(root);mkdirSync(sibling);
    const f=join(root,'valid.ts'),bad=join(sibling,'outside.ts');
    writeFileSync(f,'x');writeFileSync(bad,'x');
    assert.equal(assertPilotPathWithinRoot(root,f),'valid.ts');
    assert.equal(assertPilotPathWithinRoot(root,join(root,'new.ts'),true),'new.ts');
    assert.throws(()=>assertPilotPathWithinRoot(root,bad),/OUTSIDE_PILOT_ROOT/);
    assert.throws(()=>assertPilotPathWithinRoot(root,join(sibling,'new.ts'),true),/OUTSIDE_PILOT_ROOT/);
    try{
      const link=join(root,'link.ts');symlinkSync(bad,link,'file');
      assert.throws(()=>assertPilotPathWithinRoot(root,link),/OUTSIDE_PILOT_ROOT|LINK_TARGET_NOT_ALLOWED/);
    }catch(e){if(e.code!=='EPERM'&&e.code!=='EACCES')throw e;}
  }finally{rmSync(d,{recursive:true,force:true});}
});
