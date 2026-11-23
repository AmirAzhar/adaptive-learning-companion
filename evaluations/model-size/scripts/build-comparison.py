import json, pathlib, datetime, statistics, collections, math
root=pathlib.Path(__file__).resolve().parents[3]/'data'/'evaluation'/'experiments'/'model-size-pilot'
review=root/'review'
lookup=json.loads((review/'coordinator-map.json').read_text(encoding='utf-8'))
controls=json.loads((root/'pilot-controls.draft.json').read_text(encoding='utf-8'))['thresholds']
fmt_order=('mainIdeas','quiz','flashcards')
def seconds(a,b):
    return (datetime.datetime.fromisoformat(b.replace('Z','+00:00'))-datetime.datetime.fromisoformat(a.replace('Z','+00:00'))).total_seconds()
rows=[];cases=[]
for pid,maprow in lookup.items():
    packet=review/pid
    scorefile=packet/'reconciled.json' if (packet/'reconciled.json').exists() else packet/'review-a.json'
    if not scorefile.exists():raise ValueError('Missing review '+pid)
    score=json.loads(scorefile.read_text(encoding='utf-8'))
    caseid=maprow['caseId'];casedir=root/caseid
    manifest=json.loads((casedir/'manifest.json').read_text(encoding='utf-8'))
    calls=json.loads((casedir/'calls.json').read_text(encoding='utf-8'))
    outputs=json.loads((casedir/'outputs.json').read_text(encoding='utf-8'))
    known=sum(c['costUsd'] or 0 for c in calls)
    unknown=sum(c['costUsd'] is None for c in calls)
    allids=set(score['formats']['mainIdeas']['conceptScores'])
    high={x['id'] for x in json.loads((packet/'packet.json').read_text(encoding='utf-8'))['referenceConcepts'] if x['priority']=='high'}
    union_credit=sum(max(score['formats'][f]['conceptScores'][k] for f in fmt_order) for k in high)
    case={'packetId':pid,'caseId':caseid,'sourceSet':manifest['sourceSetId'],'model':manifest['modelId'],'size':manifest['sizeId'],'characters':manifest['characters'],'reviewType':'agent','reviewStatus':'provisional','reviewFile':str(scorefile.relative_to(root)),'calls':len(calls),'knownCostUsdLowerBound':known,'costUsd':None if unknown else known,'unknownCostCalls':unknown,'completeSetElapsedSeconds':seconds(manifest['startedAt'],manifest['endedAt']),'highPriorityDistinctCreditAcrossFormats':union_credit,'costPerAccurateHighPriorityConceptUsd':None if unknown or union_credit==0 else known/union_credit,'formatResults':{}}
    cases.append(case)
    for fmt in fmt_order:
        ag=score['formats'][fmt]['aggregates'];fcalls=[c for c in calls if c['format']==fmt]
        out=outputs[fmt]
        # Count the full user action, including the initial timed-out call and the pause before retry.
        elapsed=seconds(fcalls[0]['startedAt'],out['endedAt'])
        groups=ag['coverageByDocumentAndThird']
        group_fracs=[v['numerator']/v['denominator'] for v in groups.values() if v['denominator']]
        bydoc=collections.defaultdict(lambda:[0,0]);bythird=collections.defaultdict(lambda:[0,0])
        for key,v in groups.items():
            doc=v.get('documentId') or key.split('-')[0].split('/')[0]
            third=v.get('third')
            if third is None:
                import re
                third=int(re.search(r'(\d+)$',key).group(1))
            bydoc[doc][0]+=v['numerator'];bydoc[doc][1]+=v['denominator']
            bythird[int(third)][0]+=v['numerator'];bythird[int(third)][1]+=v['denominator']
        cknown=sum(c['costUsd'] or 0 for c in fcalls);cunknown=sum(c['costUsd'] is None for c in fcalls)
        firstcallfinal=len(fcalls)==1 and fcalls[0]['validationOutcome']=='passed_initial'
        gates={'coverage':ag['coverageFraction']>=controls[fmt]['overallCoverageMin'],'highPriority':ag['highPriorityFraction']>=controls[fmt]['highPriorityCoverageMin'],'correctness':ag['correctAndSupportedFraction']>=controls['allFormats']['correctAndSupportedFractionMin'],'seriousErrors':ag['seriousErrorCount']<=controls['allFormats']['seriousErrorsMax'],'usefulness':ag['meanUsefulness']>=controls['allFormats']['meanUsefulnessMin'],'validated':out['status']=='validated','latency':elapsed<=controls['allFormats']['latencySecondsMax']}
        row={'caseId':caseid,'sourceSet':manifest['sourceSetId'],'model':manifest['modelId'],'size':manifest['sizeId'],'format':fmt,'coverageNumerator':ag['coverageNumerator'],'coverageDenominator':ag['coverageDenominator'],'coverage':ag['coverageFraction'],'highPriorityNumerator':ag['highPriorityNumerator'],'highPriorityDenominator':ag['highPriorityDenominator'],'highPriorityCoverage':ag['highPriorityFraction'],'missingHighPriorityCount':len(ag['missingHighPriorityConcepts']),'correctAndSupportedCount':ag['correctAndSupportedCount'],'reviewedItemCount':ag['reviewedItemCount'],'correctness':ag['correctAndSupportedFraction'],'minorErrors':ag['minorErrorCount'],'seriousErrors':ag['seriousErrorCount'],'wrongKeys':ag['answerKeyErrorCount'],'usefulnessSum':ag['usefulnessSum'],'usefulnessDenominator':ag['usefulnessCount'],'meanUsefulness':ag['meanUsefulness'],'usefulnessTwoCount':ag['usefulnessTwoCount'],'duplicateCount':len(score['formats'][fmt].get('duplicates',[])),'balanceLowestGroup':min(group_fracs),'balanceGap':max(group_fracs)-min(group_fracs),'balanceSmallestGroupSize':min(v['denominator'] for v in groups.values() if v['denominator']),'coverageByDocument':dict(bydoc),'coverageByThird':dict(bythird),'coverageByDocumentAndThird':groups,'attempts':len(fcalls),'firstCallFinalSuccess':firstcallfinal,'finalValidatedSuccess':out['status']=='validated','repairCalls':sum(c['purpose']=='coverage_repair' for c in fcalls),'manualRetries':sum(c['purpose']=='manual_retry' for c in fcalls),'failedCalls':sum(c['responseStatus'] is None or (c['responseStatus'] or 0)>=400 for c in fcalls),'latencySeconds':elapsed,'knownCostUsdLowerBound':cknown,'costUsd':None if cunknown else cknown,'unknownCostCalls':cunknown,'qualityAndLatencyGates':gates,'allJudgedGatesPassed':all(gates.values())}
        rows.append(row);case['formatResults'][fmt]=row
    case['costGate']=None if unknown else known<=controls['completeSetCostUsdMax']
    case['completeSetAllJudgedGatesPassed']=all(x['allJudgedGatesPassed'] for x in case['formatResults'].values()) and case['costGate'] is True
summary={}
for model in sorted({c['model'] for c in cases}):
 for size in ('40k','100k'):
    selected=[c for c in cases if c['model']==model and c['size']==size]
    fr=[r for r in rows if r['model']==model and r['size']==size]
    known=sum(c['knownCostUsdLowerBound'] for c in selected);unknown=sum(c['unknownCostCalls'] for c in selected)
    summary[f'{model}/{size}']={'cases':3,'formats':len(fr),'firstCallFinalSuccess':sum(r['firstCallFinalSuccess'] for r in fr),'finalValidatedSuccess':sum(r['finalValidatedSuccess'] for r in fr),'calls':sum(c['calls'] for c in selected),'callsPerUsableFormat':sum(c['calls'] for c in selected)/len(fr),'repairCalls':sum(r['repairCalls'] for r in fr),'manualRetries':sum(r['manualRetries'] for r in fr),'failedCalls':sum(r['failedCalls'] for r in fr),'knownCostUsdLowerBound':known,'costUsd':None if unknown else known,'unknownCostCalls':unknown,'medianFormatSeconds':statistics.median(r['latencySeconds'] for r in fr),'maxFormatSeconds':max(r['latencySeconds'] for r in fr),'completeSetSeconds':[c['completeSetElapsedSeconds'] for c in selected]}
aggregate={'status':'provisional_agent_only','caseCount':len(cases),'formatCount':len(rows),'cases':cases,'rows':rows,'configurationSummary':summary,'limits':['One generation per source set and configuration; no precise reliability estimate.','Agent-only judgments with three independently overlapped packets and coordinator reconciliation; not human review.','Source length makes packet blinding partial.','One timed-out call has unknown billed cost; known costs are lower bounds.','Initial frontend mini Flashcards used a shorter timeout and a later manual retry.']}
(review/'agent-aggregate.json').write_text(json.dumps(aggregate,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# A compact, source-text-free comparison with 36 format rows and paired configuration summaries.
def pct(x):return f'{100*x:.0f}%'
def usd(x):return 'unknown' if x is None else f'${x:.5f}'
def one(x):return f'{x:.1f}'
lines=['# Provisional 40K versus 100K pilot comparison','','Agent-only review of all twelve saved cases. The source text and generated items remain in ignored evaluation files. Partial blinding: reviewers could infer source size from length. The three overlap packets had two independent reviews and coordinator resolution; nine had one agent review each. No case has human output review.','','## Paired results by source set, model, size, and format','','Coverage and HP show earned credit / approved concepts; correctness shows supported items / reviewed items; usefulness shows sum / count and mean. Balance is the lowest document-third coverage and the gap between highest and lowest nonempty groups (group sizes are in `review/agent-aggregate.json`). Latency includes repairs and the initial timeout-to-retry interval. Cost is per format; unknown is never zero. `Pass` requires all approved quality and latency gates.','','| Set | Model | Size | Format | Coverage | HP | Correct | Useful mean | Minor / serious / wrong key | Balance low / gap | Calls, first/final | Wait s | Cost USD | Pass |','| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |']
modelshort={'gpt-4o-mini':'Mini','gpt-6.1-terra':'Terra'};fmtshort={'mainIdeas':'Ideas','quiz':'Quiz','flashcards':'Cards'}
for r in sorted(rows,key=lambda x:(x['sourceSet'],x['size'],x['model'],fmt_order.index(x['format']))):
    errors=f"{r['minorErrors']}/{r['seriousErrors']}/{r['wrongKeys'] if isinstance(r['wrongKeys'],int) else '–'}"
    reliability=f"{r['attempts']}, {'Y' if r['firstCallFinalSuccess'] else 'N'}/{'Y' if r['finalValidatedSuccess'] else 'N'}"
    cost='unknown (≥'+usd(r['knownCostUsdLowerBound'])+')' if r['costUsd'] is None else usd(r['costUsd'])
    lines.append(f"| {r['sourceSet']} | {modelshort[r['model']]} | {r['size']} | {fmtshort[r['format']]} | {r['coverageNumerator']:g}/{r['coverageDenominator']} ({pct(r['coverage'])}) | {r['highPriorityNumerator']:g}/{r['highPriorityDenominator']} ({pct(r['highPriorityCoverage'])}) | {r['correctAndSupportedCount']}/{r['reviewedItemCount']} ({pct(r['correctness'])}) | {r['usefulnessSum']}/{r['usefulnessDenominator']} = {r['meanUsefulness']:.2f} | {errors} | {pct(r['balanceLowestGroup'])}/{pct(r['balanceGap'])} | {reliability} | {one(r['latencySeconds'])} | {cost} | {'Yes' if r['allJudgedGatesPassed'] else 'No'} |")
lines+=['','## Configuration totals','','| Model | Size | First-call complete | Final valid | Calls / usable format | Repairs / retries / failed calls | Median / max format wait s | Known cost for three sets | Exact cost |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
for key,v in summary.items():
 model,size=key.split('/')
 lines.append(f"| {modelshort[model]} | {size} | {v['firstCallFinalSuccess']}/9 | {v['finalValidatedSuccess']}/9 | {v['callsPerUsableFormat']:.2f} | {v['repairCalls']}/{v['manualRetries']}/{v['failedCalls']} | {v['medianFormatSeconds']:.1f}/{v['maxFormatSeconds']:.1f} | ≥{usd(v['knownCostUsdLowerBound'])} | {'unknown' if v['costUsd'] is None else usd(v['costUsd'])} |")
lines+=['','All 36 final formats validated. The first frontend Mini Flashcards action took the interval from its original timed-out request to the validated retry, including a manual pause; its failed call returned no usage. The first case used a 30-second Flashcards timeout before the 90-second revision, so those latency and reliability figures are not directly comparable. One run per pair is descriptive, not an estimated success rate.','','## Thresholds and decision','','The approved coverage minima are 70%/80% high-priority for Main ideas, 35%/50% for Quiz, and 50%/60% for Flashcards. Every format also requires at least 95% correct and supported items, zero serious errors, mean usefulness at least 1.3, a validated result, and wait at most 180 seconds. A complete set must cost at most $2. All 36 formats fail at least one coverage gate. Exact Mini 40K cost cannot be determined from returned usage because one timed-out call has unknown billed cost.','', 'Cost per distinct accurate high-priority concept uses the union of correctly scored concepts across the three formats in a case. It is in `review/agent-aggregate.json`; the frontend Mini 40K value remains unknown pending billing. This ratio is descriptive and does not substitute for correctness, usefulness, or latency.','','The provisional recommendation is **do not change the product limit to 100K on these results**. With the fixed 10-question and 20-card caps, coverage is poor at both sizes and generally lower at 100K. Test a different generation method or multiple targeted study sessions before spending on a second identical run. A focused repeat may be useful to separate model variance from the method effect, but agent-only judgments and one repetition cannot justify a product change. Human review of factual and usefulness calls remains the decision gate.','','## Review disagreements and limits','','The three overlap pairs disagreed on concept credit, minor versus serious classification, and usefulness. `review/overlap-reconciliation.md` records item and concept decisions against source locations. The remaining nine packets each had one agent reviewer, so their subtle factual and usefulness scores carry more uncertainty. The frozen notes themselves contain at least one technically questionable Java thread-state description; source matching alone is insufficient. Source text length makes blinding partial. The pilot measures output quality, not learning improvement.']
(root/'pilot-comparison.provisional.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('wrote aggregate',len(cases),'cases',len(rows),'format rows')
