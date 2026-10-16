#!/usr/bin/env python3
"""
Build compass-data.js from the RKY Career Compass workbook.

    python3 tools/build-compass-data.py "RKY_Career_Compass_Quiz_and_Scoring_Spec (1).xlsx"

Standard library only (an .xlsx file is a zip of XML). The workbook stays the source of
truth for question wording, answer ids, the 0-3 scoring matrix, weights, avoidance
penalties, the pathway catalogue and the 90-day templates. Anything the workbook only
describes in prose (display conditions, exclusive answers, stage grouping) is encoded in
the small tables at the top of this file so it is reviewable in one place.
"""
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
M = '{%s}' % NS['m']

# Column header in "Answer Scoring" -> pathway id (also the fixed tie-break order).
PATHWAY_COLUMNS = [
    ('Data & BI', 'DATA'), ('Project Mgmt', 'PM'), ('Business Analysis', 'BA'),
    ('KYC AML', 'AML'), ('AI Automation', 'AI'), ('Cybersecurity', 'CYBER'),
    ('Virtual Assistant', 'VA'),
]
# "Dimension" column in the workbook -> the key used by the scorer. Other values score nothing.
SCORED_DIMENSIONS = {'Experience': 'experience', 'Interests': 'interests', 'Strengths': 'strengths', 'Tools': 'tools'}

# Display conditions are prose in the workbook ("Show if" column); encoded here.
# {q, in} is true when any selected answer of question q is in the list.
SHOW_IF = {
    'Q19': {'any': [{'q': 'Q17', 'in': ['UK']}, {'q': 'Q18', 'in': ['UK']}]},
    'Q20': {'q': 'Q19', 'in': ['SPONSORED']},
    'Q21': {'q': 'Q20', 'in': ['YES']},
    'Q22': {'q': 'Q19', 'in': ['SPONSORED', 'STUDENT', 'GRADUATE', 'OTHER_PERMIT', 'UNSURE']},
}
# Build Logic row 7: mutually exclusive answers.
EXCLUSIVE = {'Q05': ['LIMITED'], 'Q07': ['NONE'], 'Q12': ['AV_NONE']}
# Build Logic row 3: "optionally preselect Yes but allow correction".
PREFILL = {'Q20': {'when': {'q': 'Q19', 'in': ['SPONSORED']}, 'value': ['YES']}}

INPUT_TYPES = {'Single select': 'single', 'Multi select': 'multiple', 'Short text': 'text'}


def read_workbook(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter(M + 't')))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    names = [s.get('name') for s in wb.find('m:sheets', NS)]
    sheets = {}
    for i, name in enumerate(names, 1):
        root = ET.fromstring(z.read('xl/worksheets/sheet%d.xml' % i))
        rows = []
        for row in root.iter(M + 'row'):
            cells = {}
            for c in row.findall('m:c', NS):
                col = re.match(r'[A-Z]+', c.get('r')).group(0)
                v = c.find('m:v', NS)
                t = c.get('t')
                if t == 'inlineStr':
                    val = ''.join(x.text or '' for x in c.iter(M + 't'))
                elif v is None:
                    continue
                elif t == 's':
                    val = shared[int(v.text)]
                else:
                    val = v.text
                cells[col] = val.strip() if isinstance(val, str) else val
            if cells:
                rows.append(cells)
        sheets[name] = rows
    return sheets


def table(rows):
    """First row = headers; returns a list of dicts keyed by header text."""
    head = rows[0]
    out = []
    for r in rows[1:]:
        out.append({head[col]: r.get(col) for col in head})
    return out


def num(v):
    f = float(v)
    return int(f) if f == int(f) else f


def split_list(text, seps):
    parts = [text]
    for sep in seps:
        parts = [p for chunk in parts for p in chunk.split(sep)]
    return [p.strip() for p in parts if p.strip()]


def build(path):
    sheets = read_workbook(path)

    # ---- answers (scoring matrix) grouped by question
    answers = {}
    for r in table(sheets['Answer Scoring']):
        points = {pid: num(r[col]) for col, pid in PATHWAY_COLUMNS if num(r.get(col, 0)) != 0}
        answers.setdefault(r['Question ID'], []).append({
            'id': r['Answer ID'], 'text': r['Answer text'], 'points': points,
            'dimension': r['Dimension'],
        })

    # ---- questions
    questions = []
    for r in table(sheets['Question Bank']):
        qid = r['ID']
        qtype = INPUT_TYPES[r['Input type']]
        mx = r.get('Max selections')
        q = {
            'id': qid, 'section': r['Section'], 'text': r['Question'], 'type': qtype,
            'required': r['Required'] == 'Yes',
        }
        if mx and mx != 'Unlimited':
            q['maxSelections'] = int(float(mx))
        if qid in EXCLUSIVE:
            q['exclusive'] = EXCLUSIVE[qid]
        if qid in SHOW_IF:
            q['showIf'] = SHOW_IF[qid]
        if qid in PREFILL:
            q['prefill'] = PREFILL[qid]
        if qtype == 'text':
            q['maxLength'] = 80
        else:
            choices = answers.get(qid, [])
            dims = {c['dimension'] for c in choices}
            scored = {SCORED_DIMENSIONS[d] for d in dims if d in SCORED_DIMENSIONS}
            if len(scored) > 1:
                raise SystemExit('%s mixes scored dimensions: %s' % (qid, scored))
            if scored:
                q['dimension'] = scored.pop()
            q['choices'] = [{'id': c['id'], 'text': c['text'], **({'points': c['points']} if c['points'] else {})}
                            for c in choices]
        questions.append(q)

    # ---- weights (percent -> fraction)
    weights = {}
    for r in table(sheets['Dimension Weights']):
        key = r['Dimension'].lower()
        if key in ('experience', 'interests', 'strengths', 'tools'):
            weights[key] = num(r['Weight %']) / 100
    if abs(sum(weights.values()) - 1) > 1e-9:
        raise SystemExit('Dimension weights do not sum to 100%%: %r' % weights)

    # ---- pathways
    id_order = [pid for _, pid in PATHWAY_COLUMNS]
    pathways = []
    for r in table(sheets['Pathway Catalogue']):
        pathways.append({
            'id': r['ID'], 'name': r['Bootcamp'],
            'signals': r['Strong signals'],
            'skillGaps': split_list(r['Skill gaps to show'], [',']),
            'starterRoles': split_list(r['Starter roles to explore'], [' / ']),
            'progressionRoles': split_list(r['Progression roles (experience-dependent)'], [' / ']),
            'portfolio': r['Portfolio example'],
        })
    pathways.sort(key=lambda p: id_order.index(p['id']))
    if [p['id'] for p in pathways] != id_order:
        raise SystemExit('Pathway Catalogue ids do not match the Answer Scoring columns')

    # ---- avoidance penalties
    avoidance = {r['Pathway']: {'answer': r['Q12 answer ID'], 'points': num(r['Penalty points'])}
                 for r in table(sheets['Avoidance Penalties'])}

    # ---- 90-day templates
    templates = [{'segment': r['Segment'], 'period': r['Period'], 'action': r['Suggested action']}
                 for r in table(sheets['90 Day Templates'])]

    return {
        'source': os.path.basename(path),
        'pathwayOrder': id_order,
        'weights': weights,
        'avoidance': avoidance,
        'pathways': pathways,
        'questions': questions,
        'templates': templates,
    }


HEADER = """/*
 * compass-data.js — GENERATED by tools/build-compass-data.py from:
 *   %s
 * Do not edit by hand. Change the workbook and re-run the generator.
 */
"""

WRAPPER = """(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.COMPASS_DATA = data;
}(typeof self !== 'undefined' ? self : this, %s));
"""


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'compass-data.js')
    data = build(src)
    body = json.dumps(data, indent=2, ensure_ascii=False)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(HEADER % data['source'] + WRAPPER % body)
    print('wrote %s (%d questions, %d pathways)' % (os.path.normpath(out), len(data['questions']), len(data['pathways'])))


if __name__ == '__main__':
    main()
