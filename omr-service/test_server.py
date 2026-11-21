"""Run with: python -m unittest test_server.py (from omr-service/)."""

import unittest

from server import apply_progress, page_count


class ProgressTest(unittest.TestCase):
    def test_counts_pages_from_homr_log(self) -> None:
        job = {"page": 0, "pages": 1}
        for line in [
            "Merging 3 files: ['score.png', 'score_1.png', 'score_2.png']",
            "Finished parsing 8 staves",
            "Finished score.png",
            "Finished score_1.png",
        ]:
            apply_progress(job, line)
        self.assertEqual(job, {"page": 2, "pages": 3})

    def test_never_counts_past_the_last_page(self) -> None:
        job = {"page": 1, "pages": 1}
        apply_progress(job, "Finished score.png")
        self.assertEqual(job["page"], 1)

    def test_page_count(self) -> None:
        self.assertEqual(page_count(b"%PDF-1.4 /Type /Pages /Type /Page /Type/Page "), 2)
        self.assertEqual(page_count(b"%PDF-1.4"), 1)


if __name__ == "__main__":
    unittest.main()
