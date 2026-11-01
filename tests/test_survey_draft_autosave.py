"""Behavioral regression for the portable browser survey autosave helper."""

from pathlib import Path
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "survey-draft-autosave.js"

JS = r"""
'use strict';
const assert = require('node:assert/strict');
const createAutosave = require(process.argv[1]);
class Store {
  constructor(disabled=false) { this.disabled=disabled; this.map=new Map(); }
  get length() { if(this.disabled)throw Error('blocked');return this.map.size; }
  key(i) { return [...this.map.keys()][i] || null; }
  getItem(k) { if(this.disabled)throw Error('blocked');return this.map.get(k) || null; }
  setItem(k,v) { if(this.disabled)throw Error('blocked');this.map.set(k,String(v)); }
  removeItem(k) { if(this.disabled)throw Error('blocked');this.map.delete(k); }
}
function emitter(obj={}) {
 const handlers={};
 obj.addEventListener=(name,cb)=>(handlers[name] ||= []).push(cb);
 obj.emit=name=>(handlers[name]||[]).forEach(cb=>cb());
 return obj;
}
function formFor(id,local,session) {
 const fields=[
   {name:'localReportId',type:'hidden',value:id},
   {name:'participantCode',type:'text',value:''},
   {name:'notes',type:'textarea',value:''},
   {name:'number',type:'number',value:''},
   {name:'selected',type:'select-one',value:'A'},
   {name:'agreed',type:'checkbox',value:'Yes',checked:false},
   {name:'effects',type:'checkbox',value:'No',checked:false},
   {name:'effects',type:'checkbox',value:'Headache',checked:false},
   {name:'radio',type:'radio',value:'A',checked:false},
   {name:'radio',type:'radio',value:'B',checked:false}
 ];
 const form=emitter({querySelectorAll:()=>fields});
 const doc=emitter({visibilityState:'visible'});
 const browser=emitter({document:doc,localStorage:local,sessionStorage:session,intervals:[],
   setInterval(fn,ms){this.intervals.push({fn,ms});}});
 const status={textContent:'',style:{}};
 const api=createAutosave({form,storagePrefix:'test-survey:v1',statusElement:status,
   window:browser,document:doc,now:()=>1000});
 const element=(name,value)=>fields.find(f=>f.name===name&&(value===undefined||f.value===value));
 const change=(name,value)=>{element(name).value=value;form.emit('input');};
 const mark=(name,value)=>{element(name,value).checked=true;form.emit('change');};
 return {form,fields,doc,browser,status,api,element,change,mark};
}
const local=new Store(), session=new Store();
const one=formFor('report-1',local,session);
assert.equal(one.api.start(),false);
assert.equal(local.length,0,'empty form must not be stored before an edit');
one.change('participantCode','anon-123456');
one.change('notes','Multi-line text \n and other details');
one.change('number','0');
one.change('selected','B');
one.mark('agreed','Yes');
one.mark('effects','Headache');
one.mark('radio','B');
const key='test-survey:v1:draft:report-1';
assert.equal(JSON.parse(local.getItem(key)).fields.notes,'Multi-line text \n and other details');
assert.equal(one.browser.intervals[0].ms,10000);
const two=formFor('temporary-id',local,session);
assert.equal(two.api.start(),true);
assert.equal(two.element('localReportId').value,'report-1');
assert.equal(two.element('notes').value,'Multi-line text \n and other details');
assert.equal(two.element('number').value,'0');
assert.equal(two.element('selected').value,'B');
assert.equal(two.element('agreed').checked,true);
assert.equal(two.element('effects','Headache').checked,true);
assert.equal(two.element('effects','No').checked,false);
assert.equal(two.element('radio','B').checked,true);
assert.match(two.status.textContent,/recovered/);
two.element('notes').value='Typed immediately before reload';
two.browser.emit('pagehide');
assert.equal(JSON.parse(local.getItem(key)).fields.notes,'Typed immediately before reload');
const sessionOther=new Store();
const otherTab=formFor('report-2',local,sessionOther);
otherTab.api.start();otherTab.change('notes','Other tab');
const sameTabReload=formFor('new',local,session);
assert.equal(sameTabReload.api.start(),true);
assert.equal(sameTabReload.element('localReportId').value,'report-1');
sameTabReload.element('localReportId').value='report-3';
sameTabReload.api.afterSubmission('report-1',false);
sameTabReload.browser.intervals[0].fn();
assert.equal(local.getItem(key),null);
assert.equal(local.getItem('test-survey:v1:draft:report-3'),null);
sameTabReload.change('notes','New unfinished report');
assert.equal(JSON.parse(local.getItem('test-survey:v1:draft:report-3')).fields.notes,'New unfinished report');
sameTabReload.element('localReportId').value='report-4';
sameTabReload.api.afterSubmission('report-3',true);
assert.equal(local.getItem('test-survey:v1:draft:report-3'),null);
assert.equal(JSON.parse(local.getItem('test-survey:v1:draft:report-4')).fields.notes,'New unfinished report');
sameTabReload.api.discard();
assert.equal(local.getItem('test-survey:v1:draft:report-4'),null);
const fallback=formFor('session-only',new Store(true),new Store());
fallback.api.start();fallback.change('notes','still here');
assert.match(fallback.status.textContent,/tab only/);
const disabled=formFor('blocked',new Store(true),new Store(true));
disabled.api.start();disabled.change('notes','cannot save');
assert.match(disabled.status.textContent,/Autosave unavailable/);
console.log('survey autosave behavior PASS');
"""


class SurveyDraftAutosaveTests(unittest.TestCase):
    def test_portable_helper_is_syntactically_valid(self):
        if not shutil.which("node"):
            self.skipTest("Node unavailable; browser integration tests remain required")
        proc = subprocess.run(
            ["node", "--check", str(TEMPLATE)],
            cwd=ROOT, capture_output=True, text=True, check=False
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_reload_recovery_submission_and_fallbacks(self):
        if not shutil.which("node"):
            self.skipTest("Node unavailable; browser integration tests remain required")
        proc = subprocess.run(
            ["node", "-e", JS, str(TEMPLATE)],
            cwd=ROOT, capture_output=True, text=True, check=False
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("survey autosave behavior PASS", proc.stdout)


if __name__ == "__main__":
    unittest.main()
