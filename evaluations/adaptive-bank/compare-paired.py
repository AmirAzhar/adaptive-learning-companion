"""Compare 40K and 100K reviews on the exact same valid reference concepts."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data/evaluation/experiments/adaptive-bank/review"
FORMATS = ("mainIdeas", "quiz", "flashcards", "union")


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def packet_data(entry):
    directory = REVIEW / entry["packetId"]
    packet = read(directory / "packet.json")
    review_path = directory / "review-primary.json"
    if not review_path.exists():
        review_path = directory / "review-alpha.json"
    review = read(review_path)
    source = ' '.join((directory / "source.md").read_text(encoding="utf-8").split())
    valid = {concept["id"] for concept in packet["referenceConcepts"]
             if ' '.join(concept["evidenceExcerpt"].split()) in source}
    return review, {original: alias for alias, original in entry["conceptIds"].items() if alias in valid}


def credit(review, alias, name):
    if name == "union":
        return max(review["conceptScores"][fmt][alias]["credit"] for fmt in FORMATS[:-1])
    return review["conceptScores"][name][alias]["credit"]


def main():
    mapping = read(REVIEW / "coordinator-map.json")
    results = {}
    for source_set in ("frontend", "java", "systems"):
        totals = {name: {"conceptCount": 0, "credit40k": 0, "credit100k": 0} for name in FORMATS}
        doc_ids = {key.split("/", 1)[1] for key in mapping if key.startswith(f"{source_set}-40k-")}
        for doc_id in doc_ids:
            small_key = f"{source_set}-40k-terra-adaptive-r1/{doc_id}"
            large_key = f"{source_set}-100k-terra-adaptive-r1/{doc_id}"
            small_review, small_ids = packet_data(mapping[small_key])
            large_review, large_ids = packet_data(mapping[large_key])
            for original_id in small_ids.keys() & large_ids.keys():
                for name in FORMATS:
                    row = totals[name]
                    row["conceptCount"] += 1
                    row["credit40k"] += credit(small_review, small_ids[original_id], name)
                    row["credit100k"] += credit(large_review, large_ids[original_id], name)
        results[source_set] = totals
    target = REVIEW.parent / "paired-shared-concepts.provisional.json"
    target.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    for source_set, formats in results.items():
        print(source_set, {name: f"{value['credit40k']} to {value['credit100k']}/{value['conceptCount']}"
                           for name, value in formats.items()})


if __name__ == "__main__":
    main()
