import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("ORADA_TEST", "1")

import db
import sim


class SimTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db.DB_PATH = Path(self.tmp.name) / "test.db"
        self.conn = db.connect()
        db.init_db(self.conn)
        sim.seed_npcs(self.conn)

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def test_npcs_seeded_and_talk_after_ticks(self):
        n = self.conn.execute("SELECT COUNT(*) AS n FROM avatars WHERE is_npc = 1").fetchone()["n"]
        self.assertEqual(n, 8)
        talks = 0
        for _ in range(20):
            result = sim.run_tick(self.conn)
            talks += result["talks"]
        self.assertGreater(talks, 0)
        me = sim.create_avatar(
            self.conn,
            name="Ada",
            persona="Meraklı",
            traits="merakli,sosyal",
            color="#e8a87c",
            emoji="🙂",
        )
        sim.deploy(self.conn, me["id"], "kafe", True)
        for _ in range(12):
            sim.run_tick(self.conn)
        events = sim.inbox(self.conn, me["id"])
        self.assertIsInstance(events, list)
        world = sim.world_snapshot(self.conn, me["id"])
        self.assertEqual(world["me_id"], me["id"])
        self.assertEqual(len(world["places"]), 8)


if __name__ == "__main__":
    unittest.main()
