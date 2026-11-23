"""Build anonymous, immutable review packets for structurally generated cases.

Usage: python evaluations/concept-planning/build-review-packets.py [--case CASE_ID]
All source text, outputs, and packet mappings remain under ignored data/evaluation/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVAL = ROOT / "data/evaluation"
EXP = EVAL / "experiments/concept-planning"
REVIEW = EXP / "review"
RUBRIC = Path(__file__).with_name("REVIEW_RUBRIC.md")
FORMATS = ("mainIdeas", "quiz", "flashcards")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha256(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(case, corpus, references, mapping):
    case_id = case["caseId"]
    existing = next((pid for pid, data in mapping.items() if data["caseId"] == case_id), None)
    if existing:
        packet_dir = REVIEW / existing
        if not (packet_dir / "packet.json").is_file() or not (packet_dir / "RUBRIC.md").is_file():
            raise RuntimeError(f"Incomplete existing review packet: {existing}")
        return existing, "existing"
    if case["runStatus"] != "generated":
        return None, "not_generated"

    case_dir = EXP / case_id
    manifest = read_json(case_dir / "manifest.json")
    outputs = read_json(case_dir / "outputs.json")
    if manifest["caseId"] != case_id or manifest["sourceSetId"] != case["sourceSetId"] or manifest["sizeId"] != case["sizeId"]:
        raise RuntimeError(f"Case manifest mismatch: {case_id}")
    if any(outputs[name]["status"] != "validated" for name in FORMATS):
        raise RuntimeError(f"Generated case lacks validated formats: {case_id}")
    size = next(size for group in corpus["sets"] if group["id"] == case["sourceSetId"]
                for size in group["sizes"] if size["id"] == case["sizeId"])
    docs = size["documents"]
    if len(docs) != 5 or [d["id"] for d in docs] != manifest["documentOrder"]:
        raise RuntimeError(f"Document order mismatch: {case_id}")
    for doc in docs:
        source = EVAL / doc["file"]
        if sha256(source) != doc["sha256"]:
            raise RuntimeError(f"Frozen source hash mismatch: {source}")
    doc_alias = {doc["id"]: f"D{i:01d}" for i, doc in enumerate(docs, 1)}

    reference_set = next(group for group in references["sets"] if group["id"] == case["sourceSetId"])
    reference_concepts = []
    concept_alias = {}
    for concept in reference_set["concepts"]:
        location = next((loc for loc in concept["locations"] if loc["sizeId"] == case["sizeId"]), None)
        if location is None:
            continue
        source_doc = next(doc for doc in docs if doc["id"] == concept["documentId"])
        if location["sha256"] != source_doc["sha256"]:
            raise RuntimeError(f"Reference source hash mismatch: {case_id}/{concept['id']}")
        alias = f"C{len(reference_concepts)+1:02d}"
        concept_alias[alias] = concept["id"]
        reference_concepts.append({"id": alias, "documentId": doc_alias[concept["documentId"]],
            "claim": concept["claim"], "priority": concept["priority"],
            "candidateTopic": concept.get("candidateTopic"), "evidenceExcerpt": concept["evidenceExcerpt"],
            "location": {"documentId": doc_alias[concept["documentId"]],
                         "start": location["start"], "third": location["third"]}})

    def item(data, alias):
        return {"id": alias, "documentId": doc_alias[data["documentId"]],
                **{key: value for key, value in data.items() if key not in ("id", "documentId")}}

    summary = outputs["mainIdeas"]["validated"]
    main_items = []
    for section in summary["sections"]:
        for idea in section["ideas"]:
            main_items.append(item(idea | {"documentId": section["documentId"]}, f"M{len(main_items)+1:02d}"))
    quiz_items = [item(q, f"Q{i:02d}") for i, q in enumerate(outputs["quiz"]["validated"]["questions"], 1)]
    card_items = [item(c, f"F{i:02d}") for i, c in enumerate(outputs["flashcards"]["validated"]["cards"], 1)]
    packet = {"packetId": None,
              "blinding": "Partial: source length may reveal size. Arm and plan output are withheld.",
              "documents": [{"id": doc_alias[doc["id"]], "file": f"sources/{doc_alias[doc['id']]}.md",
                             "characters": doc["characters"]} for doc in docs],
              "referenceConcepts": reference_concepts,
              "generated": {"mainIdeas": {"overview": summary["overview"], "items": main_items},
                            "quiz": {"items": quiz_items}, "flashcards": {"items": card_items}}}

    while True:
        pid = f"P-{secrets.token_hex(4).upper()}"
        if pid not in mapping and not (REVIEW / pid).exists():
            break
    packet["packetId"] = pid
    packet_dir = REVIEW / pid
    packet_dir.mkdir(parents=True)
    (packet_dir / "sources").mkdir()
    for doc in docs:
        (packet_dir / "sources" / f"{doc_alias[doc['id']]}.md").write_bytes((EVAL / doc["file"]).read_bytes())
    write_json(packet_dir / "packet.json", packet)
    (packet_dir / "RUBRIC.md").write_text(RUBRIC.read_text(encoding="utf-8"), encoding="utf-8")
    mapping[pid] = {"caseId": case_id, "conceptIds": concept_alias,
                    "documentIds": {alias: original for original, alias in doc_alias.items()}}
    temp = REVIEW / "coordinator-map.json.tmp"
    write_json(temp, mapping)
    temp.replace(REVIEW / "coordinator-map.json")
    return pid, "created"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", help="Only build this queued case")
    args = parser.parse_args()
    progress = read_json(EXP / "progress.json")
    cases = progress["cases"]
    if args.case:
        cases = [case for case in cases if case["caseId"] == args.case]
        if not cases:
            raise SystemExit(f"Unknown queued case: {args.case}")
    corpus = read_json(EVAL / "corpus-manifest.json")
    references = read_json(EVAL / "reference-concepts.reviewed.json")
    if references["status"] != "human_reviewed":
        raise RuntimeError("Approved reference concepts are required")
    REVIEW.mkdir(exist_ok=True)
    map_path = REVIEW / "coordinator-map.json"
    mapping = read_json(map_path) if map_path.exists() else {}
    for case in cases:
        pid, status = build(case, corpus, references, mapping)
        print(f"{case['caseId']}: {status}{' ' + pid if pid else ''}")


if __name__ == "__main__":
    main()
