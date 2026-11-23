"""Create anonymous, per-document quality review packets from completed cases.

All source text, reference concepts, output, and packet mappings stay in ignored data/evaluation/.
"""
from __future__ import annotations

import hashlib
import json
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/evaluation"
EXPERIMENT = DATA / "experiments/adaptive-bank"
REVIEW = EXPERIMENT / "review"
FORMATS = ("mainIdeas", "quiz", "flashcards")


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    progress = read(EXPERIMENT / "progress.json")
    corpus = read(DATA / "corpus-manifest.json")
    references = read(DATA / "reference-concepts.reviewed.json")
    if references["status"] != "human_reviewed":
        raise RuntimeError("Approved reference concepts are required")
    REVIEW.mkdir(exist_ok=True)
    mapping_path = REVIEW / "coordinator-map.json"
    mapping = read(mapping_path) if mapping_path.exists() else {}
    for case in progress["cases"]:
        if case["runStatus"] != "generated":
            continue
        case_id = case["caseId"]
        output = read(EXPERIMENT / case_id / "outputs.json")
        if output["status"] != "validated":
            raise RuntimeError(f"Generated case lacks validated output: {case_id}")
        size = next(size for group in corpus["sets"] if group["id"] == case["sourceSetId"]
                    for size in group["sizes"] if size["id"] == case["sizeId"])
        reference_set = next(group for group in references["sets"] if group["id"] == case["sourceSetId"])
        for doc in size["documents"]:
            doc_id = doc["id"]
            key = f"{case_id}/{doc_id}"
            if key in mapping:
                packet_dir = REVIEW / mapping[key]["packetId"]
                if not (packet_dir / "packet.json").is_file():
                    raise RuntimeError(f"Incomplete packet: {key}")
                continue
            source = DATA / doc["file"]
            if hashlib.sha256(source.read_bytes()).hexdigest() != doc["sha256"]:
                raise RuntimeError(f"Frozen source changed: {doc_id}")
            concepts = []
            reference_ids = {}
            for concept in reference_set["concepts"]:
                if concept["documentId"] != doc_id:
                    continue
                location = next((item for item in concept["locations"] if item["sizeId"] == case["sizeId"]), None)
                if location is None:
                    continue
                if location["sha256"] != doc["sha256"]:
                    raise RuntimeError(f"Reference/source mismatch: {key}/{concept['id']}")
                alias = f"C{len(concepts)+1:02d}"
                reference_ids[alias] = concept["id"]
                concepts.append({"id": alias, "claim": concept["claim"],
                                 "priority": concept["priority"], "evidenceExcerpt": concept["evidenceExcerpt"],
                                 "location": {"start": location["start"], "third": location["third"]}})
            generated = {name: [item for item in output["bank"][name] if item["documentId"] == doc_id]
                         for name in FORMATS}
            for name, items in generated.items():
                if not items:
                    raise RuntimeError(f"No {name} items: {key}")
            while True:
                packet_id = f"A-{secrets.token_hex(4).upper()}"
                packet_dir = REVIEW / packet_id
                if not packet_dir.exists():
                    break
            packet_dir.mkdir()
            (packet_dir / "source.md").write_bytes(source.read_bytes())
            packet = {"packetId": packet_id, "blinding": "Method and input size hidden; source length may reveal size.",
                      "sourceFile": "source.md", "sourceCharacters": doc["characters"],
                      "referenceConcepts": concepts, "generated": generated}
            write(packet_dir / "packet.json", packet)
            (packet_dir / "RUBRIC.md").write_text((Path(__file__).with_name("REVIEW_RUBRIC.md")).read_text(encoding="utf-8"), encoding="utf-8")
            mapping[key] = {"packetId": packet_id, "conceptIds": reference_ids}
            write(mapping_path, mapping)
            print(f"{key}: {packet_id}")


if __name__ == "__main__":
    main()
