#!/usr/bin/env python3
"""Offline instruction inventory and structural checks; NOT a semantic/live verdict."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

EXCLUDED_PARTS={'.git','node_modules','.next','dist','build','coverage','source-archive','fixtures','__fixtures__','evals','experiments'}

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def paths(root: Path) -> list[str]:
    cp=subprocess.run(['git','-C',str(root),'ls-files','--cached','--others','--exclude-standard','-z'],stdout=subprocess.PIPE,check=True)
    return sorted(set(p.decode('utf-8') for p in cp.stdout.split(b'\0') if p))

def category(name: str) -> str|None:
    p=Path(name)
    if any(part in EXCLUDED_PARTS for part in p.parts): return None
    if p.name in {'AGENTS.md','AGENTS.override.md','CLAUDE.md','SKILL.md'}: return 'entrypoint'
    if p.parts[0]=='protocols' and p.suffix=='.xml': return 'canonical_public_protocol'
    if p.parts[0]=='patterns' and p.suffix=='.md': return 'conditional_pattern'
    if p.parts[0]=='templates' and p.suffix in {'.md','.json'}: return 'template'
    if p.parts[0]=='project' and p.suffix=='.md' and any(x in p.name for x in ('INSTRUCTIONS','MODULE','INHERITANCE')): return 'project_routing'
    if p.name in {'LESSON-INDEX.md','INDEX.md'} and (len(p.parts)==1 or p.parts[0] in {'docs','skills','project'}): return 'index'
    if p.suffix in {'.ts','.mts','.mjs','.js','.json','.py'} and any(x in p.name.lower() for x in ('prompt','supervis','instruction','admission','directive','custom-gpt','plugin')):
        if p.parts[0] not in {'tests','test','audits','state','feedback'}: return 'runtime_or_packaging_candidate'
    return None

def normalize(text: str) -> str:
    return re.sub(r'\s+',' ',text).strip()

def check_profile(root: Path, profile: dict) -> list[str]:
    errors=[]
    roles=profile['roles']
    visiting=set(); visited=set()
    def visit(name):
        if name in visiting: errors.append('role dependency cycle: '+name); return
        if name in visited: return
        if name not in roles: errors.append('unknown inherited role: '+name); return
        visiting.add(name)
        for parent in roles[name].get('inherits',[]): visit(parent)
        visiting.remove(name); visited.add(name)
    for role in roles: visit(role)
    for name,role in roles.items():
        for path in role.get('local_sources',[]):
            if not (root/path).is_file(): errors.append(f'{name}: missing local source {path}')
        if role.get('audience')=='public':
            inherited=role.get('inherits',[])
            if any(roles.get(x,{}).get('audience')!='public' for x in inherited): errors.append(name+': public inherits internal role')
            joined=' '.join(role.get('local_sources',[])+role.get('external_sources',[]))
            if any(x in joined for x in ('AGENTS.md','DEVELOPMENT_INHERITANCE','universal-dev-architecture','codex-mission-control')):
                errors.append(name+': public development dependency')
    for path,cap in profile.get('max_chars',{}).items():
        if (root/path).is_file() and len((root/path).read_text(encoding='utf-8'))>=cap:
            errors.append(f'{path}: character cap exceeded ({cap})')
    for path,required in profile.get('required_fragments',{}).items():
        p=root/path
        if not p.is_file(): errors.append('missing required file '+path); continue
        text=p.read_text(encoding='utf-8')
        for fragment in required:
            if fragment not in text: errors.append(f'{path}: missing contract fragment {fragment!r}')
    return errors

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path('.')); p.add_argument('--verify',action='store_true')
    a=p.parse_args(); root=a.root.resolve()
    profile_path=root/'scripts/instruction-layering-profile.json'
    if not profile_path.is_file(): raise SystemExit('Missing instruction-layering-profile.json')
    profile=json.loads(profile_path.read_text(encoding='utf-8'))
    inventory=[]; duplicates=collections.defaultdict(list); exports=[]
    listed=paths(root)
    for name in listed:
        kind=category(name)
        if kind is None: continue
        path=root/name
        if not path.is_file() or path.is_symlink(): continue
        data=path.read_bytes()
        try: content=data.decode('utf-8',errors='strict')
        except UnicodeDecodeError: continue
        item={'path':name,'kind':kind,'bytes':len(data),'characters':len(content),'sha256':digest(data),
              'semantic_review':'NOT_ESTABLISHED_BY_THIS_SCAN'}
        if kind=='canonical_public_protocol':
            parsed=ET.fromstring(content)
            item['protocol']={k:parsed.attrib.get(k) for k in ('name','version','revisionDate')}
            item['root_children']=[{'tag':e.tag,'id':e.get('id'),'name':e.get('name'),'priority':e.get('priority')} for e in parsed]
        inventory.append(item)
        # Exact-normalized duplicates are candidates for semantic review, not automatic deletions.
        if kind!='runtime_or_packaging_candidate':
            for match in re.finditer(r'(?s)(?:^|\n\s*\n)(.+?)(?=\n\s*\n|\Z)',content):
                block=normalize(match.group(1))
                if len(block)>=160:
                    duplicates[digest(block.encode())].append({'path':name,'line':content[:match.start(1)].count('\n')+1,'characters':len(block)})
        # Export active-looking source for a Chat-owned full review; never sealed fixtures/experiments.
        if kind in {'entrypoint','project_routing','index','conditional_pattern','runtime_or_packaging_candidate'}:
            exports.append(name)
    duplicate_groups=[{'normalized_sha256':key,'occurrences':v} for key,v in duplicates.items() if len({e['path'] for e in v})>1]
    agent_paths={e['path']:e['bytes'] for e in inventory if Path(e['path']).name=='AGENTS.md'}
    chains=[]
    for name in sorted(agent_paths):
        parent=Path(name).parent
        chain=[]
        for d in [*reversed(parent.parents),parent]:
            relative=(d/'AGENTS.md').as_posix()
            if relative in agent_paths and relative not in chain: chain.append(relative)
        chains.append({'leaf':name,'files':chain,'bytes':sum(agent_paths[x] for x in chain),'default_budget_bytes':32768})
    errors=check_profile(root,profile)
    for leaf in profile.get('budgeted_native_chains',[]):
        rows=[x for x in chains if x['leaf']==leaf]
        if not rows: errors.append('missing budgeted native chain: '+leaf)
        elif rows[0]['bytes']>32768: errors.append('native chain exceeds 32768 bytes: '+leaf)
    result={'schema_version':1,'evidence_class':'STRUCTURAL_SOURCE_INVENTORY_ONLY',
            'semantic_or_live_compliance_proven':False,'inventory':inventory,'native_agent_chains':chains,
            'public_protocol_total_bytes':sum(x['bytes'] for x in inventory if x['kind']=='canonical_public_protocol'),
            'normalized_duplicate_candidates':duplicate_groups,'approved_source_export_paths':exports,
            'checks':{'pass':not errors,'errors':errors},
            'exclusions':sorted(EXCLUDED_PARTS),
            'limits':['References are not proof of runtime loading.','Duplicate candidates are not semantic-equivalence findings.',
                      'Runtime/packaging filenames are a lexical inventory, not exhaustive prompt-flow tracing.',
                      'Private configurations, installed bytes, hidden provider instructions, and frozen evidence were not inspected.']}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 1 if a.verify and errors else 0
if __name__=='__main__': raise SystemExit(main())
