import io
import json
import runpy
import sys
import tempfile
import unittest
import os
from pathlib import Path
from unittest.mock import patch
SCRIPT=Path(__file__).resolve().parents[2]/'scripts/sales/fetch.py'
class FetchTests(unittest.TestCase):
    def run_fetch(self, args, response):
        with patch.object(sys,'argv',[str(SCRIPT),*args]), patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(response).encode())) as call, patch('time.sleep'), patch('builtins.print'):
            runpy.run_path(str(SCRIPT),run_name='__main__')
            return call.call_count
    def test_default_reloads_and_completed_resume_is_rejected(self):
        original=Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                first={'recordsFiltered':1,'data':[{'sdF_ID':'first','parcelNumber':'p'}]}
                second={'recordsFiltered':1,'data':[{'sdF_ID':'second','parcelNumber':'p'}]}
                self.assertEqual(self.run_fetch([],first),1)
                self.assertEqual(self.run_fetch([],second),1)
                self.assertEqual(json.loads(Path('.sales-data/marion-2026.json').read_text())['data'][0]['sdF_ID'],'second')
                with self.assertRaises(SystemExit):self.run_fetch(['--resume'],first)
            finally:os.chdir(original)
    def test_resume_preserves_capture_time_and_fetches_only_remaining_page(self):
        original=Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                cache=Path('.sales-data/gateway-run');cache.mkdir(parents=True)
                (cache/'state.json').write_text(json.dumps({'capturedAt':'2026-01-01T00:00:00Z','complete':False}))
                (cache/'page-0.json').write_text(json.dumps({'recordsFiltered':2,'data':[{'sdF_ID':'a','parcelNumber':'p'}]}))
                self.assertEqual(self.run_fetch(['--resume'],{'recordsFiltered':2,'data':[{'sdF_ID':'b','parcelNumber':'q'}]}),1)
                result=json.loads(Path('.sales-data/marion-2026.json').read_text())
                self.assertEqual(len(result['data']),2)
                self.assertEqual(result['capturedAt'],'2026-01-01T00:00:00Z')
            finally:os.chdir(original)
if __name__=='__main__':unittest.main()
