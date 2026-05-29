from __future__ import annotations

import difflib
from dataclasses import dataclass


@dataclass(frozen=True)
class DiffRow:
    kind: str
    leftNo: int | None
    rightNo: int | None
    leftText: str
    rightText: str


def compute_side_by_side(left: str, right: str) -> dict:
    left_lines = left.splitlines()
    right_lines = right.splitlines()

    sm = difflib.SequenceMatcher(a=left_lines, b=right_lines)
    rows: list[DiffRow] = []

    left_no = 1
    right_no = 1
    added = 0
    removed = 0

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                rows.append(
                    DiffRow(
                        kind="ctx",
                        leftNo=left_no,
                        rightNo=right_no,
                        leftText=left_lines[i1 + k],
                        rightText=right_lines[j1 + k],
                    )
                )
                left_no += 1
                right_no += 1
        elif tag == "delete":
            for k in range(i2 - i1):
                rows.append(
                    DiffRow(
                        kind="del",
                        leftNo=left_no,
                        rightNo=None,
                        leftText=left_lines[i1 + k],
                        rightText="",
                    )
                )
                left_no += 1
                removed += 1
        elif tag == "insert":
            for k in range(j2 - j1):
                rows.append(
                    DiffRow(
                        kind="add",
                        leftNo=None,
                        rightNo=right_no,
                        leftText="",
                        rightText=right_lines[j1 + k],
                    )
                )
                right_no += 1
                added += 1
        else:
            a_chunk = left_lines[i1:i2]
            b_chunk = right_lines[j1:j2]
            m = max(len(a_chunk), len(b_chunk))
            for k in range(m):
                a_line = a_chunk[k] if k < len(a_chunk) else ""
                b_line = b_chunk[k] if k < len(b_chunk) else ""
                a_no = left_no if k < len(a_chunk) else None
                b_no = right_no if k < len(b_chunk) else None
                rows.append(
                    DiffRow(
                        kind="chg",
                        leftNo=a_no,
                        rightNo=b_no,
                        leftText=a_line,
                        rightText=b_line,
                    )
                )
            left_no += len(a_chunk)
            right_no += len(b_chunk)
            removed += len(a_chunk)
            added += len(b_chunk)

    return {
        "addedLines": added,
        "removedLines": removed,
        "rows": [r.__dict__ for r in rows],
    }

