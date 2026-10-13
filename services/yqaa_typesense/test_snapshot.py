import hashlib, importlib.util, json, pathlib, unittest

spec=importlib.util.spec_from_file_location('search_app',pathlib.Path(__file__).with_name('app.py'))
app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)

class SnapshotTests(unittest.TestCase):
    def fixture(self, changes=None):
        rows=[{'chunk_key':str(n),'body':'Public guide','source_url':'https://example.com/guide'} for n in range(1500)]
        if changes:changes(rows)
        raw=b'\n'.join(json.dumps(x).encode() for x in rows)
        return raw,{'sha256':hashlib.sha256(raw).hexdigest(),'count':len(rows)}
    def test_valid_snapshot(self):
        raw,m=self.fixture();self.assertEqual(len(app.validate_snapshot(raw,m)),1500)
    def test_corruption_rejected(self):
        raw,m=self.fixture()
        with self.assertRaisesRegex(RuntimeError,'hash'):app.validate_snapshot(raw+b'x',m)
    def test_count_mismatch_rejected(self):
        raw,m=self.fixture();m['count']=1501
        with self.assertRaisesRegex(RuntimeError,'count'):app.validate_snapshot(raw,m)
    def test_duplicate_key_rejected(self):
        raw,m=self.fixture(lambda rows:rows[1].update(chunk_key='0'))
        with self.assertRaisesRegex(RuntimeError,'duplicate'):app.validate_snapshot(raw,m)
    def test_private_source_rejected(self):
        raw,m=self.fixture(lambda rows:rows[0].update(source_url='private://customer'))
        with self.assertRaisesRegex(RuntimeError,'source'):app.validate_snapshot(raw,m)
    def test_partial_import_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'import'):app.validate_import(b'{"success":true}\n{"success":false}',2)
    def test_missing_import_receipt_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'import'):app.validate_import(b'{"success":true}',2)
    def test_complete_import(self):
        app.validate_import(b'{"success":true}\n{"success":true}',2)

if __name__=='__main__':unittest.main()
