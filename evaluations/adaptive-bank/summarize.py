"""Summarize structural output, reliability, latency, and known cost without quality claims."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXP = ROOT / "data/evaluation/experiments/adaptive-bank"


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def duration(start: str, end: str | None):
    if not end:
        return None
    return round((datetime.fromisoformat(end.replace("Z", "+00:00")) -
                  datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds(), 1)


def main():
    progress = read(EXP / "progress.json")
    rows = []
    for case in progress["cases"]:
        case_dir = EXP / case["caseId"]
        if not case_dir.exists():
            rows.append({"caseId": case["caseId"], "status": case["runStatus"]})
            continue
        manifest = read(case_dir / "manifest.json")
        calls = read(case_dir / "calls.json")
        output = read(case_dir / "outputs.json")
        row = {"caseId": case["caseId"], "status": output["status"],
               "characters": manifest["characters"],
               "extractedConcepts": sum(len(doc.get("concepts") or []) for doc in output["documents"].values()),
               "mainIdeas": len(output["bank"]["mainIdeas"]),
               "quiz": len(output["bank"]["quiz"]),
               "flashcards": len(output["bank"]["flashcards"]),
               "calls": len(calls), "validatedCalls": sum(c["validationOutcome"] == "validated" for c in calls),
               "failedCalls": sum(c["validationOutcome"] in ("failed", "failed_validation", "runner_error_output_not_preserved") for c in calls),
               "knownCostUsd": round(sum(c["costUsd"] or 0 for c in calls), 9),
               "unknownCostCalls": sum(c["costUsd"] is None for c in calls),
               "apiSeconds": round(sum(duration(c["startedAt"], c["endedAt"]) or 0 for c in calls), 1),
               "elapsedSeconds": duration(manifest["startedAt"], manifest["endedAt"]),
               "error": output.get("error")}
        rows.append(row)
    target = EXP / "structural-summary.json"
    target.write_text(json.dumps({"notice": "Structural and billing results only; quality scores pending review.",
                                  "cases": rows}, indent=2) + "\n", encoding="utf-8")
    print(target)
    for row in rows:
        print(row["caseId"], row["status"],
              f"{row.get('mainIdeas', 0)}/{row.get('quiz', 0)}/{row.get('flashcards', 0)}",
              f"${row.get('knownCostUsd', 0):.6f}")


if __name__ == "__main__":
    main()
