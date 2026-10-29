import argparse
import contextlib
import io
import json
import os
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/accela'))
import import_cases
from parser import Page,extract,application_tables,party,is_occupant
from http_client import Form,postback
from import_cases import page_links,prioritized_queue,build_parser,detail_errors_fatal,run

class ImportTests(unittest.TestCase):
    def test_missing_details_precede_refreshes_and_do_not_duplicate(self):
        class DB:
            def table(self,table,query):
                self.query=query
                return [{'case_number':'new'}]
            def rpc(self,action,payload): return [{'case_number':'old'},{'case_number':'new'},{'case_number':'other'}]
        db=DB()
        self.assertEqual([r['case_number'] for r in prioritized_queue(db,2)],['new','old'])
        self.assertEqual(db.query['detail_checked_at'],'is.null')
        self.assertTrue(db.query['next_detail_at'].startswith('lte.'))
    def test_contacts_are_not_assumed_to_be_owners(self):
        self.assertTrue(is_occupant(['OCCUPANT','1 TEST ST']))
        self.assertFalse(is_occupant(['Example Person','1 TEST ST']))
        self.assertEqual(party(['OCCUPANT'],'occupant')['source_role'],'Violator')
    def test_repeated_violations_and_uppercase_comments_preserved(self):
        result=application_tables(['NOTICE OF VIOLATION','Date:','09/29/2026','Comments:','TRASH IN ALLEY','Date:','09/30/2026'],{'NOTICE OF VIOLATION'})
        self.assertEqual(len(result),1)
        self.assertEqual([p['label'] for p in result[0]['entries']],['Date','Comments','Date'])
        self.assertEqual(result[0]['entries'][1]['value'],'TRASH IN ALLEY')
    def test_postback_preserves_state_and_ignores_unchecked_inputs(self):
        html='<input name="__VIEWSTATE" value="abc"><input name="x" type="checkbox"><select name="s"><option value="1">one</option><option selected value="2">two</option></select>'
        f=postback(html,'search')
        self.assertEqual(f['__VIEWSTATE'],'abc');self.assertNotIn('x',f);self.assertEqual(f['s'],'2')
    def test_real_ids_and_next_page(self):
        links,target,_=page_links('<a href="/INDY/Cap/CapDetail.aspx?capID1=26VIO&amp;capID3=99999">VIO26-000001</a><a href="javascript:__doPostBack(\'next-control\',\'\')">Next &gt;</a>')
        self.assertIn('capID3=99999',links['VIO26-000001']);self.assertEqual(target,'next-control')
    def test_error_page_rejected(self):
        with self.assertRaises(ValueError):extract('<h1>Server error</h1>','https://example.invalid')
    def test_multiple_occupants_and_violators(self):
        html='''<div>Case Number</div><span>VIO26-000001</span><span>:</span><span>Trash</span>
        <b>Record Status:</b><span>Open</span><h1>Owner:</h1><div>Example LLC</div><b>More Details</b>
        <table id="x_RelatContactList"><tr><td><h2>Violator information</h2><span>OCCUPANT</span></td></tr>
        <tr><td><h2>Violator information</h2><span>Example Person</span></td></tr></table>'''
        r=extract(html,'https://aca-prod.accela.com/INDY/Cap/CapDetail.aspx?capID1=a')
        self.assertEqual(len(r['occupants']),1);self.assertEqual(len(r['violators']),1)
        self.assertEqual(r['owners'][0]['display_name'],'Example LLC')
        self.assertIsNone(r['project_description'])

class RunExitTests(unittest.TestCase):
    def setUp(self):
        self.mod=import_cases
        self.saved=(import_cases.Database,import_cases.AccelaHTTP,import_cases.extract,import_cases.discover)
        self.fail=set()
        self.db=self.FakeDB()
        fail=self.fail
        class HTTP:
            def __init__(self, heartbeat=lambda: None):
                self.heartbeat=heartbeat
            def get(self, url, fields=None):
                self.heartbeat()
                if url in fail: raise TimeoutError('timed out')
                return 'ok'
        def discover_should_not_run(*args, **kwargs):
            raise AssertionError('discover should not run')
        import_cases.Database=lambda: self.db
        import_cases.AccelaHTTP=HTTP
        import_cases.extract=lambda html, url: {'case_number':url,'owners':[{'display_name':'Example'}]}
        import_cases.discover=discover_should_not_run
    def tearDown(self):
        self.mod.Database,self.mod.AccelaHTTP,self.mod.extract,self.mod.discover=self.saved
    class FakeDB:
        def __init__(self):
            self.queue=[]; self.run_id='test-run'; self.finished=None
        def rpc(self, action, payload=None):
            if action=='start': return {'acquired':True,'last_discovery_end':'2026-10-28'}
            if action in ('heartbeat','error','discover'): return {}
            if action=='queue': return []
            if action=='detail': return {'changed':0}
            if action=='finish':
                self.finished=payload
                return {'pending_details':0}
            raise AssertionError(action)
        def table(self, table, query, payload=None):
            if payload is not None: return None
            return list(self.queue)
    def args(self, **overrides):
        values=dict(start='2026-10-28',end='2026-10-28',details_only=True,missing_only=False,
            case_number=None,workers=1,max_details=150,max_seconds=2700,
            detail_error_rate=0.10,detail_error_minimum=3)
        values.update(overrides)
        return argparse.Namespace(**values)
    def queue(self, ok, bad):
        self.db.queue=[]; self.fail.clear()
        for i in range(ok):
            case='ok-%d'%i
            self.db.queue.append({'case_number':case,'source_url':case})
        for i in range(bad):
            case='bad-%d'%i
            self.db.queue.append({'case_number':case,'source_url':case})
            self.fail.add(case)
    def capture(self, **overrides):
        buf=io.StringIO(); code=0
        with contextlib.redirect_stdout(buf):
            try: run(self.args(**overrides))
            except SystemExit as exc: code=exc.code
        return code, buf.getvalue()
    def summary(self, out):
        return json.loads(next(line for line in out.splitlines() if line.startswith('{')))
    def test_threshold_math(self):
        self.assertFalse(detail_errors_fatal(0,148,0.10,3))
        self.assertFalse(detail_errors_fatal(2,148,0.10,3))
        self.assertFalse(detail_errors_fatal(2,2,0.10,3))
        self.assertFalse(detail_errors_fatal(5,100,0.10,3))
        self.assertFalse(detail_errors_fatal(10,100,0.10,3))
        self.assertTrue(detail_errors_fatal(11,100,0.10,3))
        self.assertTrue(detail_errors_fatal(5,10,0.10,3))
        self.assertFalse(detail_errors_fatal(2,0,0.10,3))
        self.assertTrue(detail_errors_fatal(3,0,0.10,3))
    def test_threshold_cli_and_env_defaults(self):
        keys=('ACCELA_DETAIL_ERROR_RATE','ACCELA_DETAIL_ERROR_MINIMUM')
        saved={key:os.environ.get(key) for key in keys}
        try:
            for key in keys: os.environ.pop(key, None)
            args=build_parser().parse_args([])
            self.assertEqual(args.detail_error_rate,0.10)
            self.assertEqual(args.detail_error_minimum,3)
            os.environ['ACCELA_DETAIL_ERROR_RATE']='0.25'
            os.environ['ACCELA_DETAIL_ERROR_MINIMUM']='5'
            args=build_parser().parse_args([])
            self.assertEqual(args.detail_error_rate,0.25)
            self.assertEqual(args.detail_error_minimum,5)
            args=build_parser().parse_args(['--detail-error-rate','0.4','--detail-error-minimum','8'])
            self.assertEqual(args.detail_error_rate,0.4)
            self.assertEqual(args.detail_error_minimum,8)
        finally:
            for key,value in saved.items():
                if value is None: os.environ.pop(key, None)
                else: os.environ[key]=value
    def test_no_detail_errors_exits_zero(self):
        self.queue(4,0)
        code,out=self.capture()
        self.assertEqual(code,0)
        self.assertEqual(self.db.finished['status'],'success')
        self.assertEqual(self.db.finished['metrics']['details_checked'],4)
        self.assertEqual(self.db.finished['metrics']['detail_errors'],0)
        self.assertEqual(self.summary(out)['status'],'success')
        self.assertNotIn('::warning::',out)
    def test_few_detail_errors_under_threshold_exits_zero_and_warns(self):
        self.queue(148,2)
        code,out=self.capture()
        self.assertEqual(code,0)
        self.assertEqual(self.db.finished['status'],'partial')
        self.assertEqual(self.db.finished['metrics']['details_checked'],148)
        self.assertEqual(self.db.finished['metrics']['detail_errors'],2)
        self.assertEqual(self.summary(out)['status'],'partial')
        warning=next(line for line in out.splitlines() if line.startswith('::warning::'))
        self.assertEqual(warning,'::warning::Accela import partial: 2 detail error(s) out of 148 details checked (threshold 10%, minimum 3)')
    def test_high_share_below_minimum_count_stays_green(self):
        self.queue(2,2)
        code,out=self.capture()
        self.assertEqual(code,0)
        self.assertEqual(self.db.finished['status'],'partial')
        self.assertEqual(self.db.finished['metrics']['details_checked'],2)
        self.assertEqual(self.db.finished['metrics']['detail_errors'],2)
        self.assertIn('::warning::Accela import partial: 2 detail error(s) out of 2 details checked',out)
    def test_errors_within_rate_stay_green(self):
        self.queue(100,5)
        code,out=self.capture()
        self.assertEqual(code,0)
        self.assertEqual(self.db.finished['status'],'partial')
        self.assertEqual(self.db.finished['metrics']['details_checked'],100)
        self.assertEqual(self.db.finished['metrics']['detail_errors'],5)
        self.assertIn('::warning::Accela import partial: 5 detail error(s) out of 100 details checked',out)
    def test_configured_threshold_can_fail_a_small_error_count(self):
        self.queue(148,2)
        code,out=self.capture(detail_error_rate=0.01,detail_error_minimum=1)
        self.assertEqual(code,1)
        self.assertEqual(self.db.finished['status'],'partial')
        self.assertEqual(self.summary(out)['detail_errors'],2)
        self.assertNotIn('::warning::',out)
    def test_detail_errors_over_threshold_exits_nonzero(self):
        self.queue(10,5)
        code,out=self.capture()
        self.assertEqual(code,1)
        self.assertEqual(self.db.finished['status'],'partial')
        self.assertEqual(self.db.finished['metrics']['detail_errors'],5)
        self.assertEqual(self.db.finished['metrics']['details_checked'],10)
        self.assertEqual(self.summary(out)['status'],'partial')
        self.assertNotIn('::warning::',out)
    def test_run_error_exits_nonzero(self):
        def boom(client, start, end): raise ValueError('CSV and paginated detail links disagree')
        self.mod.discover=boom
        code,out=self.capture(details_only=False)
        self.assertEqual(code,1)
        self.assertEqual(self.db.finished['status'],'failed')
        self.assertIn('ValueError',self.db.finished['error'])
        self.assertEqual(self.summary(out)['status'],'failed')
        self.assertNotIn('::warning::',out)
if __name__=='__main__':unittest.main()
