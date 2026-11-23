import json, pathlib, collections, math, re, sys
root=pathlib.Path(__file__).resolve().parents[3]/'data'/'evaluation'/'experiments'/'model-size-pilot'/'review'
fail=[];passed=[]
for packet in sorted(root.glob('P-*')):
    packet_data=json.loads((packet/'packet.json').read_text(encoding='utf-8'))
    refs={x['id']:x for x in packet_data['referenceConcepts']}
    hi={k for k,v in refs.items() if v['priority']=='high'}
    target=packet/'reconciled.json' if (packet/'reconciled.json').exists() else packet/'review-a.json'
    if not target.exists():continue
    data=json.loads(target.read_text(encoding='utf-8'));errors=[]
    if data.get('packetId')!=packet.name or data.get('reviewerType')!='agent' or data.get('status')!='provisional':errors.append('identity/status')
    for fmt in ('mainIdeas','quiz','flashcards'):
        v=data['formats'][fmt];cs=v['conceptScores'];items=v['itemScores'];ag=v['aggregates']
        expected={x['id'] for x in packet_data['generated'][fmt]['items']}|({'M00'} if fmt=='mainIdeas' else set())
        if set(cs)!=set(refs) or any(score not in (0,.5,1) for score in cs.values()):errors.append(fmt+' concept map')
        if set(items)!=expected:errors.append(fmt+' item map')
        if any(x.get('correctness') not in ('correct_supported','minor_issue','serious_error') or x.get('usefulness') not in (0,1,2) for x in items.values()):errors.append(fmt+' item values')
        if any(x.get('correctness')!='correct_supported' and x.get('usefulness')!=0 for x in items.values()):errors.append(fmt+' incorrect usefulness')
        if any(not x.get('sourceLocation') for x in items.values() if x.get('correctness')!='correct_supported'):errors.append(fmt+' error source location')
        checks={'coverageNumerator':sum(cs.values()),'coverageDenominator':len(cs),'highPriorityNumerator':sum(cs[k] for k in hi),'highPriorityDenominator':len(hi),'correctAndSupportedCount':sum(x['correctness']=='correct_supported' for x in items.values()),'reviewedItemCount':len(items),'minorErrorCount':sum(x['correctness']=='minor_issue' for x in items.values()),'seriousErrorCount':sum(x['correctness']=='serious_error' for x in items.values()),'usefulnessSum':sum(x['usefulness'] for x in items.values()),'usefulnessCount':len(items),'usefulnessTwoCount':sum(x['usefulness']==2 for x in items.values())}
        for key,val in checks.items():
            if key not in ag or not math.isclose(ag[key],val,abs_tol=1e-8):errors.append(fmt+' '+key)
        groups=collections.defaultdict(lambda:[0,0])
        for k,score in cs.items():
            ref=refs[k];groups[(ref['documentId'],ref['location']['third'])][0]+=score;groups[(ref['documentId'],ref['location']['third'])][1]+=1
        actual={}
        for key,value in ag.get('coverageByDocumentAndThird',{}).items():
            doc=value.get('documentId');third=value.get('third')
            if not doc:
                doc=key.split('-')[0].split('/')[0]
                third=int(re.search(r'(\d+)$',key).group(1))
            actual[(doc,int(third))]=[value['numerator'],value['denominator']]
        if dict(groups)!=actual:errors.append(fmt+' groups')
        if not math.isclose(ag.get('coverageFraction',-1),checks['coverageNumerator']/len(cs),abs_tol=1e-8):errors.append(fmt+' coverage fraction')
        if not math.isclose(ag.get('highPriorityFraction',-1),checks['highPriorityNumerator']/len(hi),abs_tol=1e-8):errors.append(fmt+' high fraction')
        if not math.isclose(ag.get('correctAndSupportedFraction',-1),checks['correctAndSupportedCount']/len(items),abs_tol=1e-8):errors.append(fmt+' correct fraction')
        if not math.isclose(ag.get('meanUsefulness',-1),checks['usefulnessSum']/len(items),abs_tol=1e-8):errors.append(fmt+' usefulness mean')
        if set(ag.get('missingHighPriorityConcepts',[]))!={k for k in hi if cs[k]==0}:errors.append(fmt+' missing high')
    (fail if errors else passed).append((packet.name,target.name,errors))
for p,name,errors in passed:print('PASS',p,name)
for p,name,errors in fail:print('FAIL',p,name,errors)
if fail:sys.exit(1)
