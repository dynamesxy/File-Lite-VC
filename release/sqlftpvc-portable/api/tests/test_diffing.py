import unittest


class TestDiffing(unittest.TestCase):
    def test_compute_side_by_side_counts(self):
        from sqlftpvc.diffing import compute_side_by_side

        left = "a\nkeep\nremove\n"
        right = "a\nkeep\nadd\n"
        r = compute_side_by_side(left, right)
        self.assertGreaterEqual(r["addedLines"], 1)
        self.assertGreaterEqual(r["removedLines"], 1)
        self.assertTrue(len(r["rows"]) > 0)

    def test_compute_side_by_side_contains_kinds(self):
        from sqlftpvc.diffing import compute_side_by_side

        left = "x\ny\n"
        right = "x\nz\n"
        r = compute_side_by_side(left, right)
        kinds = {row["kind"] for row in r["rows"]}
        self.assertIn("ctx", kinds)
        self.assertIn("chg", kinds)


if __name__ == "__main__":
    unittest.main()

