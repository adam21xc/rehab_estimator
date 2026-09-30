import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/accela'))
from parser import Page,extract,application_tables,party,is_occupant
from http_client import Form,postback
from import_cases import page_links

class ImportTests(unittest.TestCase):
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
if __name__=='__main__':unittest.main()
