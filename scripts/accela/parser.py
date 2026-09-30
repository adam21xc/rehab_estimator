"""Parse Accela case details while preserving source roles and repeated fields."""
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, parse_qs

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.stack = []
        self.lines = []
        self.links = []
        self.anchors = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and 'CapDetail.aspx' in attrs.get('href', ''):
            self.links.append(urljoin('https://aca-prod.accela.com', attrs['href']))
        node = {'tag': tag, 'attrs': attrs, 'text': []}
        self.nodes.append(node)
        if tag == 'a':
            self.anchors.append(node)
        if tag not in ('input', 'img', 'br', 'hr', 'meta', 'link', 'wbr', 'area', 'source'):
            self.stack.append(node)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i]['tag'] == tag:
                self.stack = self.stack[:i]
                break
    def handle_data(self, data):
        if any(n['tag'] in ('script', 'style') for n in self.stack):
            return
        text = ' '.join(data.split())
        if text:
            self.lines.append(text)
            for node in self.stack:
                node['text'].append(text)
    def section(self, suffix):
        matches = [n['text'] for n in self.nodes if n['attrs'].get('id', '').endswith(suffix)]
        return matches[0] if matches else []

def between(lines, start, end):
    if start not in lines:
        return []
    pos = lines.index(start) + 1
    stop = lines.index(end, pos) if end in lines[pos:] else len(lines)
    return lines[pos:stop]

def application_tables(lines, titles):
    """Preserve repeating rows as ordered pairs; never overwrite duplicate labels."""
    groups = []
    for value in lines:
        if value == 'Application Information Table':
            continue
        if value in titles:
            groups.append({'title': value, 'entries': []})
        elif groups:
            entries = groups[-1]['entries']
            if value.endswith(':'):
                entries.append({'label': value[:-1], 'value': ''})
            elif entries:
                entries[-1]['value'] = (entries[-1]['value'] + ' ' + value).strip()
    return groups

def violators(lines):
    result = []
    for line in lines:
        if line == 'Violator information':
            result.append([])
        elif result:
            result[-1].append(line)
    return result

def is_occupant(lines):
    return bool(lines) and lines[0].strip().upper() in ('OCCUPANT', 'OCCUPANTS', 'CURRENT OCCUPANT', 'TENANT', 'UNKNOWN OCCUPANT')

def party(lines, role):
    # Preserve source spelling and lines; do not guess which person is an owner.
    lines = [x for x in lines if x != '*']
    phones = []
    emails = []
    for i, value in enumerate(lines):
        if 'phone:' in value.lower() and i + 1 < len(lines):
            phones.append(lines[i + 1])
        if re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            emails.append(value)
    return {'role': role, 'source_role': 'Owner' if role == 'owner' else 'Violator',
            'display_name': lines[0] if lines else None, 'raw_lines': lines,
            'phones': phones, 'emails': emails}

def extract(html, url):
    page = Page(); page.feed(html)
    if 'Case Number' not in page.lines or 'Record Status:' not in page.lines or 'More Details' not in page.lines:
        raise ValueError('Expected case detail page; refusing to treat an error page as data')
    lines = page.lines
    details = lines
    contacts = page.section('_RelatContactList')
    tables = page.section('_tbASITList')
    return {
        'source_url': url,
        'fetched_at': datetime.now(timezone.utc).isoformat(),
        'source_record_ids': {k: v[0] for k,v in parse_qs(urlparse(url).query).items() if k in ('capID1','capID2','capID3','agencyCode')},
        'case_number': lines[lines.index('Case Number') + 1],
        'case_type': ' '.join(between(lines, 'Case Number', 'Record Status:')[2:]),
        'record_status': lines[lines.index('Record Status:') + 1],
        'project_description': '\n'.join(between(details, 'Project Description:', 'Owner:')) or None,
        'owners': [party(between(details, 'Owner:', 'More Details'), 'owner')] if 'Owner:' in details[:details.index('More Details')] else [],
        'related_contacts': contacts,
        'violators': [party(v, 'violator') for v in violators(contacts) if not is_occupant(v)],
        'occupants': [party(v, 'occupant') for v in violators(contacts) if is_occupant(v)],
        'application_information': page.section('_tbASIList'),
        'application_tables': application_tables(tables, {' '.join(n['text']) for n in page.nodes if 'ACA_Title_Text' in n['attrs'].get('class', '')}),
        'application_tables_text': tables,
        'parcel_information': page.section('_palParceList'),
    }
