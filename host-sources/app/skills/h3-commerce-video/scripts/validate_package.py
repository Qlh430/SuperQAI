"""Read-only checks for the H3 commerce prompt package; never proves media quality."""
import argparse
import json
import re
import sys
from pathlib import Path

FIELDS = ('subject_definitions', 'summary', 'retention_analysis', 'detailed_description',
          'overall_soundscape', 'non_diegetic_music')
PRESENTATION_MODES = ('presenter', 'product_voiceover')
HANZI = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')


def validate_copy(package):
    errors, warnings = [], []
    def require(ok, message):
        if not ok:
            errors.append(message)
    script = package.get('full_script', '')
    require(isinstance(script, str) and bool(script.strip()), 'Provide full_script')
    script = script if isinstance(script, str) else ''
    count = len(HANZI.findall(script))
    require(isinstance(package.get('script_hanzi_count'), int) and package['script_hanzi_count'] == count,
            f'Full script: claimed Hanzi count differs from actual {count}')
    plan = package.get('selling_plan', {})
    plan = plan if isinstance(plan, dict) else {}
    condition_review = plan.get('condition_review', {})
    condition_review = condition_review if isinstance(condition_review, dict) else {}
    for category in ('selection', 'effect', 'operation'):
        items = condition_review.get(category)
        require(isinstance(items, list) and all(isinstance(x,str) and bool(x.strip()) for x in items),
                f'condition_review.{category}: provide source excerpt array')
    for field in ('core_reasons', 'purchase_conditions'):
        items = plan.get(field)
        require(isinstance(items, list), f'selling_plan.{field}: provide array')
        if field == 'core_reasons':
            require(bool(items), 'Provide at least one core reason')
        for index,item in enumerate(items if isinstance(items, list) else []):
            item = item if isinstance(item, dict) else {}
            label = f'{field} item {index+1}'
            require(isinstance(item.get('source'), str) and bool(item['source'].strip()), f'{label}: provide source')
            quote = item.get('dialogue_quote', '')
            require(isinstance(quote, str) and bool(quote.strip()) and quote in script,
                    f'{label}: dialogue_quote must occur verbatim in full_script')
    rows = package.get('storyboard', [])
    rows = rows if isinstance(rows, list) else []
    rows = [r for r in rows if isinstance(r, dict)]
    require(bool(rows), 'Provide storyboard rows for the actual script')
    require(''.join(r.get('dialogue', '') for r in rows if isinstance(r.get('dialogue'), str)) == script,
            'Storyboard dialogue must reconstruct full_script verbatim')
    loads = []
    for index,row in enumerate(rows):
        values = [row.get(k) for k in ('start','end','speech_start','speech_end')]
        if not all(isinstance(v,(int,float)) for v in values):
            errors.append(f'Copy row {index+1}: numeric visual and speech times')
            continue
        start,end,speech_start,speech_end = values
        require(start <= speech_start < speech_end <= end, f'Copy row {index+1}: speech inside shot')
        dialogue = row.get('dialogue', '')
        dialogue = dialogue if isinstance(dialogue, str) else ''
        density = len(HANZI.findall(dialogue))/max(.01,speech_end-speech_start)
        loads.append({'row':index+1, 'hanzi_per_second':round(density,2)})
        if density > 6.5:
            warnings.append(f'Copy row {index+1}: planned {density:.2f} Hanzi/second; redistribute speech')
    return dict(passed=not errors, actual_hanzi_count=count, errors=errors, warnings=warnings,
                planned_speech_load=loads,
                scope='Quote occurrence, counts and planned timing only; source meaning and completeness require review.')


def validate(package, pictures=4, b_audio_reference=True):
    errors, warnings, counts = [], [], {}
    def require(ok, message):
        if not ok:
            errors.append(message)

    for key in ('status', 'input_mapping', 'facts', 'limitations', 'immutable_identity_block',
                'storyboard', 'dialogue_hanzi_counts', 'prompt_a', 'prompt_b'):
        require(key in package, f'Missing {key}')
    mode = package.get('presentation_mode', 'presenter')
    require(mode in PRESENTATION_MODES, 'presentation_mode: presenter or product_voiceover')
    speaker = 'Narrator (S1)' if mode == 'product_voiceover' else '<Subject 1> (S1)'
    identity = package.get('immutable_identity_block', '')
    require(isinstance(identity, str) and bool(identity.strip()), 'Provide immutable_identity_block')
    rows = package.get('storyboard', [])
    require(isinstance(rows, list), 'storyboard must be an array')
    rows = rows if isinstance(rows, list) else []
    state_fields = ('state_in', 'state_out', 'transition')
    state_trace_present = any(isinstance(r, dict) and any(k in r for k in state_fields) for r in rows)
    version = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)', str(package.get('skill_version', '')))
    current_contract = bool(version and tuple(map(int, version.groups())) >= (0, 2, 7))
    if version and tuple(map(int, version.groups())) >= (0, 2, 11):
        require('presentation_mode' in package, 'v0.2.11+: provide presentation_mode')
    if current_contract:
        require(state_trace_present, 'v0.2.7+: provide storyboard state trace')
    if state_trace_present:
        ordered = sorted((r for r in rows if isinstance(r, dict)),
                         key=lambda r: (str(r.get('segment', '')), str(r.get('shot', ''))))
        previous = None
        for row in ordered:
            label = f'{row.get("segment")} shot {row.get("shot")}'
            for field in ('state_in', 'state_out'):
                require(isinstance(row.get(field), str) and bool(row[field].strip()),
                        f'{label}: nonempty {field}')
            first_a = row.get('segment') == 'A' and row.get('shot') == 1
            allowed = {'start'} if first_a else {'continuous', 'cut'}
            require(row.get('transition') in allowed, f'{label}: valid incoming transition')
            if row.get('segment') == 'B' and row.get('shot') == 1:
                require(row.get('transition') == 'continuous', 'B shot 1: continue A guide state')
            if row.get('transition') == 'continuous' and previous is not None:
                require(row.get('state_in') == previous.get('state_out'),
                        f'{label}: continuous state must equal previous ending state')
            previous = row
    claimed = package.get('dialogue_hanzi_counts', {})
    claimed = claimed if isinstance(claimed, dict) else {}
    for segment, key in [('A', 'prompt_a'), ('B', 'prompt_b')]:
        text = package.get(key, '')
        if not isinstance(text, str):
            errors.append(f'{segment}: prompt must be text')
            continue
        matches = list(re.finditer(r'^([a-z_]+):\s*$', text, re.M))
        require(tuple(m[1] for m in matches) == FIELDS, f'{segment}: six fields in required order')
        sections = {m[1]: text[m.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip()
                    for i, m in enumerate(matches)}
        definitions = sections.get('subject_definitions', '')
        if mode == 'product_voiceover':
            require(speaker in definitions, f'{segment}: define independent Narrator (S1)')
            require(not re.search(r'<Subject \d+>\s*\(S\d+\)', text),
                    f'{segment}: product subjects cannot be the narrator')
        has_audio = segment == 'B' and b_audio_reference
        identity_expected = identity.strip() if isinstance(identity, str) else ''
        if has_audio:
            pieces = definitions.split('\n<Audio 1>', 1)
            require(len(pieces) == 2 and pieces[0].strip() == identity_expected,
                    f'{segment}: copy identity exactly, then append Audio 1 definition')
        else:
            require(definitions == identity_expected, f'{segment}: copy identity exactly')
        require(bool(re.search(r'<Audio 1>', definitions)) == has_audio,
                f'{segment}: audio reference must match actual connection')
        prefix = '[reference generation + audio reference]' if has_audio else '[reference generation]'
        require(sections.get('summary', '').startswith(prefix), f'{segment}: summary prefix {prefix}')
        used_pictures = [int(x) for x in re.findall(r'<Picture (\d+)>', text)]
        require(all(1 <= x <= pictures for x in used_pictures), f'{segment}: Picture outside connected slots')
        require(not re.search(r'<Video \d+>', text), f'{segment}: this workflow has no reference video')
        if mode == 'presenter':
            require(not re.search(r'<Subject 2>\s*\(S\d+\)', text), f'{segment}: silent product cannot have speaker ID')
        retention = sections.get('retention_analysis', '')
        for subject in sorted(set(re.findall(r'<Subject \d+>', identity_expected))):
            require(bool(re.search(re.escape(subject)+r'[^\n]*(fully_preserved|partially_preserved|reference)', retention)),
                    f'{segment}: retention relationship for {subject}')
        if has_audio:
            require(bool(re.search(r'<Audio 1>[^\n]*reference', retention)), 'B: Audio 1 retention relationship')
        detail = sections.get('detailed_description', '')
        all_dialogue = re.findall(r'<d>(.*?)</d>', text, re.S)
        dialogue = re.findall(r'<d>(.*?)</d>', detail, re.S)
        require(len(dialogue) == len(all_dialogue), f'{segment}: dialogue only in detailed_description')
        require(bool(dialogue) and all(d.strip().startswith('[Chinese]') for d in dialogue),
                f'{segment}: every dialogue has [Chinese]')
        counts[segment] = len(HANZI.findall(''.join(dialogue)))
        if any(re.search(r'参考图|有图可看|上一段|下一段|工作流|提示词|Picture\s*\d|(?:商品介绍|资料|详情页)(?:说|写|标注|显示|提到)',d) for d in dialogue):
            warnings.append(f'{segment}: production language in shopping dialogue; review wording')
        require(isinstance(claimed.get(segment), int) and claimed.get(segment) == counts[segment],
                f'{segment}: claimed Hanzi count differs from actual {counts[segment]}')
        if not 65 <= counts[segment] <= 80:
            warnings.append(f'{segment}: {counts[segment]} Hanzi outside initial 65-80 experiment range')
        shots = list(re.finditer(r'\[Shot (\d+)\]', detail))
        require([int(m[1]) for m in shots] in ([1, 2], [1, 2, 3]), f'{segment}: two or three sequential shots')
        previous_time = 0.0
        segment_rows = [r for r in rows if isinstance(r, dict) and r.get('segment') == segment]
        require(len(segment_rows) == len(shots), f'{segment}: storyboard and prompt shot counts match')
        for i, shot in enumerate(shots):
            number = int(shot[1])
            body = detail[shot.end():shots[i+1].start() if i+1 < len(shots) else len(detail)].strip()
            time = re.match(r'At (\d{2}):(\d{2})\.(\d{3}),', body)
            if i == 0:
                require(not re.match(r'(At |From \d|\d\d:)', body), f'{segment} shot 1: no timestamp interval')
                cut_time = 0.0
            else:
                require(time is not None, f'{segment} shot {number}: explicit At MM:SS.mmm cut')
                cut_time = int(time[1])*60+int(time[2])+int(time[3])/1000 if time else previous_time
                require(previous_time < cut_time < 15.083334, f'{segment} shot {number}: increasing cut within segment')
            previous_time = cut_time
            require(not re.search(r'\bthen\s+(?:the shot\s+)?cuts?\b', body, re.I),
                    f'{segment} shot {number}: extra cut needs its own shot number')
            ds = re.findall(r'<d>(.*?)</d>', body, re.S)
            if ds:
                require(speaker in body, f'{segment} shot {number}: explicit speaker identity')
            matching = [r for r in segment_rows if r.get('shot') == number]
            require(len(matching) == 1, f'{segment} shot {number}: one matching storyboard row')
            if len(matching) != 1:
                continue
            row = matching[0]
            for field in ('start','end','visual','dialogue','pictures','speaker','mouth_visible','image_status','speech_start','speech_end'):
                require(field in row, f'{segment} shot {number}: missing {field}')
            require(row.get('speaker') == 'S1', f'{segment} shot {number}: S1 voice source')
            require(isinstance(row.get('mouth_visible'), bool), f'{segment} shot {number}: boolean mouth_visible')
            if mode == 'product_voiceover':
                require(row.get('mouth_visible') is False,
                        f'{segment} shot {number}: product voiceover has no visible speaking mouth')
            refs = row.get('pictures', [])
            require(isinstance(refs, list) and bool(refs) and all(isinstance(x,int) and 1 <= x <= pictures for x in refs),
                    f'{segment} shot {number}: valid evidence picture list')
            spoken = ''.join(re.sub(r'^\s*\[Chinese\]\s*', '', d) for d in ds)
            require(spoken == row.get('dialogue'), f'{segment} shot {number}: storyboard dialogue equals prompt')
            values = [row.get(k) for k in ('start','end','speech_start','speech_end')]
            if all(isinstance(v,(int,float)) for v in values):
                start, end, speech_start, speech_end = values
                require(abs(start-cut_time) < .002 and start < end <= 15.083334,
                        f'{segment} shot {number}: storyboard time matches cut')
                require(start <= speech_start <= speech_end <= end,
                        f'{segment} shot {number}: speech within shot')
                require(speech_end <= (14.6 if segment == 'A' else 14.8),
                        f'{segment} shot {number}: plan speech tail before merge/end')
                density = len(HANZI.findall(spoken)) / max(.01,speech_end-speech_start)
                if density > 6.5:
                    warnings.append(f'{segment} shot {number}: planned {density:.2f} Hanzi/second; redistribute dialogue or time')
            else:
                require(False, f'{segment} shot {number}: numeric time values')
    copy_review_present = current_contract
    if copy_review_present:
        copy_report = validate_copy(package)
        errors.extend(copy_report['errors'])
        warnings.extend(copy_report['warnings'])
    return dict(passed=not errors, actual_hanzi_counts=counts, errors=errors, warnings=warnings,
                state_trace_present=state_trace_present,
                copy_review_present=copy_review_present,
                scope='Text contract only; facts, actual cuts, sound and lip sync require media review.')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('package', type=Path)
    p.add_argument('--pictures', type=int, default=4)
    p.add_argument('--b-audio-reference', action='store_true')
    p.add_argument('--copy-only', action='store_true', help='Check a script/storyboard draft without H3 fields')
    a = p.parse_args()
    try:
        contents = sys.stdin.read() if str(a.package) == '-' else a.package.read_text(encoding='utf-8-sig')
        package = json.loads(contents)
        report = validate_copy(package) if a.copy_only else validate(package, a.pictures, a.b_audio_reference)
    except (OSError, ValueError, TypeError, AttributeError) as exc:
        report = dict(passed=False, errors=[str(exc)])
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['passed'] else 1)
