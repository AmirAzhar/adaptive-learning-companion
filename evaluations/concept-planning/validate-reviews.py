"""Check arithmetic and completeness of provisional blinded review files."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'data/evaluation/experiments/concept-planning/review'
FORMATS = ('mainIdeas', 'quiz', 'flashcards')


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def check_count(label, actual, expected):
    if abs(actual - expected) > 1e-8:
        raise ValueError(f'{label}: {actual} != {expected}')


def validate(packet_path, review_path):
    packet, review = read(packet_path), read(review_path)
    prefix = f'{packet_path.parent.name}/{review_path.name}'
    refs = packet['referenceConcepts']
    ref_by_id = {item['id']: item for item in refs}
    if review['packetId'] != packet['packetId'] or review['status'] != 'provisional' or review['reviewerType'] != 'agent':
        raise ValueError(f'{prefix}: review identity or status invalid')
    if len(ref_by_id) != len(refs):
        raise ValueError(f'{prefix}: duplicate reference IDs')
    for fmt in FORMATS:
        scores = review['conceptScores'][fmt]
        if set(scores) != set(ref_by_id):
            raise ValueError(f'{prefix}/{fmt}: missing concept scores')
        expected_ids = {item['id'] for item in packet['generated'][fmt]['items']}
        if fmt == 'mainIdeas':
            expected_ids.add('M00')
        judgments = review['itemJudgments'][fmt]
        if {item['id'] for item in judgments} != expected_ids or len(judgments) != len(expected_ids):
            raise ValueError(f'{prefix}/{fmt}: missing or duplicate item judgments')
        for concept_id, entry in scores.items():
            if entry['credit'] not in (0, 0.5, 1):
                raise ValueError(f'{prefix}/{fmt}/{concept_id}: invalid credit')
            if entry['credit'] and not entry['supportingItemIds']:
                raise ValueError(f'{prefix}/{fmt}/{concept_id}: credit lacks item support')
            if not set(entry['supportingItemIds']) <= expected_ids:
                raise ValueError(f'{prefix}/{fmt}/{concept_id}: invalid item ID')
        for item in judgments:
            if item['correctness'] not in ('correct_supported', 'minor_issue', 'serious_error') or item['usefulness'] not in (0, 1, 2):
                raise ValueError(f'{prefix}/{fmt}/{item["id"]}: invalid item judgment')
            if item['correctness'] != 'correct_supported' and item['usefulness'] != 0:
                raise ValueError(f'{prefix}/{fmt}/{item["id"]}: incorrect item given usefulness credit')
        summary = review['formatSummary'][fmt]
        check_count(f'{prefix}/{fmt}/all', summary['all']['numerator'], sum(x['credit'] for x in scores.values()))
        check_count(f'{prefix}/{fmt}/denominator', summary['all']['denominator'], len(refs))
        high = [r for r in refs if r['priority'] == 'high']
        check_count(f'{prefix}/{fmt}/high', summary['highPriority']['numerator'], sum(scores[r['id']]['credit'] for r in high))
        check_count(f'{prefix}/{fmt}/high denominator', summary['highPriority']['denominator'], len(high))
        for doc in packet['documents']:
            group = [r for r in refs if r['documentId'] == doc['id']]
            actual = summary['byDocument'][doc['id']]
            check_count(f'{prefix}/{fmt}/{doc["id"]}', actual['numerator'], sum(scores[r['id']]['credit'] for r in group))
            check_count(f'{prefix}/{fmt}/{doc["id"]} denominator', actual['denominator'], len(group))
        for third in (1, 2, 3):
            group = [r for r in refs if r['location']['third'] == third]
            actual = summary['bySourceThird'][str(third)]
            check_count(f'{prefix}/{fmt}/third{third}', actual['numerator'], sum(scores[r['id']]['credit'] for r in group))
            check_count(f'{prefix}/{fmt}/third{third} denominator', actual['denominator'], len(group))
        items = summary['items']
        check_count(f'{prefix}/{fmt}/reviewed', items['reviewed'], len(judgments))
        check_count(f'{prefix}/{fmt}/supported', items['supported'], sum(j['correctness'] == 'correct_supported' for j in judgments))
        check_count(f'{prefix}/{fmt}/minor', items['minorIssues'], sum(j['correctness'] == 'minor_issue' for j in judgments))
        check_count(f'{prefix}/{fmt}/serious', items['seriousErrors'], sum(j['correctness'] == 'serious_error' for j in judgments))
        check_count(f'{prefix}/{fmt}/usefulness', items['usefulnessSum'], sum(j['usefulness'] for j in judgments))
        check_count(f'{prefix}/{fmt}/usefulness2', items['usefulness2Count'], sum(j['usefulness'] == 2 for j in judgments))
    union = review['union']['conceptScores']
    if set(union) != set(ref_by_id):
        raise ValueError(f'{prefix}: incomplete union')
    for concept_id in ref_by_id:
        expected = max(review['conceptScores'][fmt][concept_id]['credit'] for fmt in FORMATS)
        actual = union[concept_id]['credit'] if isinstance(union[concept_id], dict) else union[concept_id]
        check_count(f'{prefix}/union/{concept_id}', actual, expected)
    check_count(f'{prefix}/union total', review['union']['all']['numerator'],
                sum(max(review['conceptScores'][fmt][concept_id]['credit'] for fmt in FORMATS) for concept_id in ref_by_id))
    check_count(f'{prefix}/union denominator', review['union']['all']['denominator'], len(refs))
    return prefix


if __name__ == '__main__':
    reviews = sorted([*ROOT.glob('P-*/review-alpha.json'), *ROOT.glob('P-*/review-beta.json'),
                      *ROOT.glob('P-*/normalized-gamma.json'), *ROOT.glob('P-*/reconciled.json')])
    for review in reviews:
        print('valid', validate(review.parent / 'packet.json', review))
    print(f'Validated {len(reviews)} provisional review files.')
