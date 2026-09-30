"""Sequential, cookie-aware ASP.NET client. No Chrome, credentials, or third-party packages."""
import time
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.parse import urlencode, urlparse
from urllib.error import HTTPError, URLError

SEARCH_URL = 'https://aca-prod.accela.com/INDY/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement'
class Form(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.fields = {}; self.select = None; self.options = []
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'input' and a.get('name'):
            kind = a.get('type', '').lower()
            if kind not in ('submit','button','image','file') and (kind not in ('checkbox','radio') or 'checked' in a):
                self.fields[a['name']] = a.get('value','')
        if tag == 'select':
            self.select = a.get('name'); self.options = []
        if tag == 'option' and self.select:
            self.options.append((a.get('value',''),'selected' in a))
    def handle_endtag(self, tag):
        if tag == 'select' and self.select:
            self.fields[self.select] = next((v for v,s in self.options if s), self.options[0][0] if self.options else '')
            self.select = None

def postback(html, target):
    fields = Form(html).fields
    if '__VIEWSTATE' not in fields:
        raise ValueError('Missing ASP.NET form state')
    fields['__EVENTTARGET'] = target; fields['__EVENTARGUMENT'] = ''
    fields.pop('__ASYNCPOST', None); fields.pop('ctl00$ScriptManager1',None)
    return fields

class AccelaHTTP:
    def __init__(self, heartbeat=lambda: None):
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.heartbeat = heartbeat
    def get(self, url, fields=None):
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.netloc != 'aca-prod.accela.com' or not parsed.path.startswith('/INDY/'):
            raise ValueError('Unexpected Accela URL')
        headers={'User-Agent':'Accela CRM importer', 'Referer':SEARCH_URL,'Origin':'https://aca-prod.accela.com'}
        for attempt in range(3):
            self.heartbeat(); time.sleep(1)
            try:
                req=Request(url,data=urlencode(fields).encode() if fields is not None else None,headers=headers)
                with self.opener.open(req,timeout=60) as response:
                    content=response.read().decode('utf-8-sig')
                if 'systemErrorMessage_lblMessage' in content or 'captcha' in content.lower() and 'Case Number' not in content:
                    raise ValueError('Accela error/challenge response; saved data unchanged')
                return content
            except HTTPError as e:
                if e.code not in (429,500,502,503,504) or attempt==2: raise
                delay=e.headers.get('Retry-After','')
                time.sleep(min(60,int(delay)) if delay.isdigit() else 2**(attempt+1))
            except (URLError,TimeoutError):
                if attempt==2: raise
                time.sleep(2**(attempt+1))
