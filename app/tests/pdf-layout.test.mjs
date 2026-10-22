import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('PDF阶段连续分页、续页表头及长内容完整性',()=>{
 const python=process.env.PLANNER_PYTHON||join(process.env.USERPROFILE,'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
 const result=spawnSync(python,[fileURLToPath(new URL('./pdf_layout_test.py',import.meta.url))],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout);
});
