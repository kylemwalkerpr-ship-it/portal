import ast
import hashlib
import importlib.util
import shutil
import sys
import tempfile
import types
import unittest
import uuid
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parents[1]))
import modal_storage_proof_logic as proof


SOURCE = Path(__file__).parents[1] / "modal_storage_proof.py"


class ModalStorageProofTests(unittest.TestCase):
    def setUp(self):
        self.proof_id = str(uuid.uuid4())
        self.relative = proof.artifact_relative_path(self.proof_id)

    def test_artifact_path_accepts_uuid_and_rejects_traversal(self):
        self.assertEqual(self.relative, f"{proof.ARTIFACT_ROOT}/{self.proof_id}.bin")
        with self.assertRaises(ValueError):
            proof.artifact_relative_path("../../other")
        with self.assertRaises(ValueError):
            proof.mounted_path(f"{proof.ARTIFACT_ROOT}/../../outside.bin")

    def test_sha256_matches_known_payload(self):
        self.assertEqual(proof.sha256_bytes(b"abc"), hashlib.sha256(b"abc").hexdigest())

    def test_cleanup_removes_own_artifact_and_only_empty_writer_created_dirs(self):
        with tempfile.TemporaryDirectory() as mount:
            root = Path(mount) / proof.ARTIFACT_ROOT
            root.mkdir(parents=True)
            own = root / f"{self.proof_id}.bin"
            other = root / f"{uuid.uuid4()}.bin"
            own.write_bytes(b"own")
            other.write_bytes(b"other")
            self.assertTrue(proof.remove_own_path(mount, self.relative, []))
            self.assertFalse(own.exists())
            self.assertTrue(other.exists())
            self.assertTrue(root.exists())

    def test_writer_cleanup_removes_only_empty_directories_it_created(self):
        with tempfile.TemporaryDirectory() as mount:
            result = proof.write_local(mount, self.relative, b"mine", lambda: None)
            self.assertEqual(len(result["created_dirs"]), 2)
            self.assertTrue(proof.remove_own_path(mount, self.relative, result["created_dirs"]))
            self.assertFalse((Path(mount) / proof.ARTIFACT_ROOT).exists())

        with tempfile.TemporaryDirectory() as mount:
            result = proof.write_local(mount, self.relative, b"mine", lambda: None)
            sibling_path = Path(mount) / proof.ARTIFACT_ROOT / f"{uuid.uuid4()}.bin"
            sibling_path.write_bytes(b"peer")
            self.assertTrue(proof.remove_own_path(mount, self.relative, result["created_dirs"]))
            self.assertTrue(sibling_path.exists())
            self.assertTrue(sibling_path.parent.exists())

    def test_real_run_proof_reader_failure_invokes_cleanup(self):
        calls = []
        def writer(path, payload):
            calls.append("write")
            return {"size_bytes": len(payload), "sha256": proof.sha256_bytes(payload), "created_dirs": []}
        def reader(path):
            calls.append("read")
            raise RuntimeError("injected reader failure")
        def cleanup(path, dirs):
            calls.append(("cleanup", dirs))
            return {"removed": True}
        with self.assertRaisesRegex(RuntimeError, "injected reader failure") as raised:
            proof.run_proof(self.relative, b"payload", writer, reader, cleanup, lambda p: {"own_path_missing": True})
        self.assertEqual(calls, ["write", "read", ("cleanup", [])])
        self.assertFalse(raised.exception.innerrecord["proof_passed"])
        self.assertEqual(raised.exception.innerrecord["cleanup_status"], "passed")
        self.assertTrue(raised.exception.innerrecord["absence_check"]["own_path_missing"])

    def test_real_run_proof_cleanup_failure_is_reported(self):
        def writer(path, payload):
            return {"size_bytes": len(payload), "sha256": proof.sha256_bytes(payload), "created_dirs": []}
        def cleanup(path, dirs):
            raise OSError("injected cleanup failure")
        with self.assertRaisesRegex(OSError, "injected cleanup failure") as raised:
            proof.run_proof(self.relative, b"payload", writer,
                            lambda p: {"size_bytes": 7, "sha256": proof.sha256_bytes(b"payload")},
                            cleanup, lambda p: {"own_path_missing": True})
        record = raised.exception.innerrecord
        self.assertFalse(record["proof_passed"])
        self.assertEqual(record["cleanup_status"], "failed")
        self.assertIn("write", record)
        self.assertIn("read", record)
        self.assertNotIn("absence_check", record)

    def test_real_run_proof_hash_mismatch_fails_and_cleans(self):
        cleaned = []
        writer = lambda p, b: {"size_bytes": len(b), "sha256": proof.sha256_bytes(b), "created_dirs": []}
        reader = lambda p: {"size_bytes": 1, "sha256": proof.sha256_bytes(b"wrong")}
        cleanup = lambda p, d: cleaned.append((p, d)) or {"removed": True}
        with self.assertRaisesRegex(RuntimeError, "did not match") as raised:
            proof.run_proof(self.relative, b"payload", writer, reader, cleanup,
                            lambda p: {"own_path_missing": True})
        self.assertEqual(len(cleaned), 1)
        self.assertFalse(raised.exception.innerrecord["proof_passed"])
        self.assertEqual(raised.exception.innerrecord["cleanup_status"], "passed")

    def test_real_run_proof_happy_path_returns_complete_record_and_orders_callbacks(self):
        calls = []
        payload = b"fixture payload"
        with tempfile.TemporaryDirectory() as mount:
            def writer(path, data):
                calls.append("write")
                return proof.write_local(mount, path, data, lambda: calls.append("commit"))
            def reader(path):
                calls.append("read")
                return proof.read_local(mount, path, lambda: calls.append("reload"))
            def cleanup(path, dirs):
                calls.append("cleanup")
                return {"removed": proof.remove_own_path(mount, path, dirs)}
            def absence(path):
                calls.append("absence")
                return {"own_path_missing": not (Path(mount) / path).exists(), "root_entries": []}
            record = proof.run_proof(self.relative, payload, writer, reader, cleanup, absence)
        self.assertEqual(calls, ["write", "commit", "read", "reload", "cleanup", "absence"])
        self.assertTrue(record["proof_passed"])
        self.assertEqual(record["write"]["sha256"], proof.sha256_bytes(payload))
        self.assertEqual(record["read"]["size_bytes"], len(payload))
        self.assertTrue(record["cleanup"]["removed"])
        self.assertTrue(record["absence_check"]["own_path_missing"])

    def test_writer_failure_still_runs_scoped_cleanup(self):
        calls = []
        def writer(path, payload):
            calls.append("write")
            raise OSError("injected writer failure")
        def cleanup(path, dirs):
            calls.append(("cleanup", dirs))
            return {"removed": False}
        def absence(path):
            calls.append("absence")
            return {"own_path_missing": True}
        with self.assertRaisesRegex(OSError, "injected writer failure") as raised:
            proof.run_proof(self.relative, b"payload", writer, lambda p: {}, cleanup, absence)
        self.assertEqual(calls, ["write", ("cleanup", []), "absence"])
        self.assertFalse(raised.exception.innerrecord["proof_passed"])
        self.assertNotIn("read", raised.exception.innerrecord)

    def test_remote_resource_limits_keep_supported_scaledown_minimum(self):
        tree = ast.parse(SOURCE.read_text())
        configs = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                   and isinstance(node.func, ast.Attribute) and node.func.attr == "function"]
        self.assertEqual(len(configs), 4)
        for config in configs:
            values = {kw.arg: ast.literal_eval(kw.value) for kw in config.keywords if kw.arg in {
                "gpu", "cpu", "memory", "min_containers", "max_containers", "buffer_containers",
                "scaledown_window", "timeout", "startup_timeout", "retries"}}
            self.assertEqual(values, {"gpu": None, "cpu": (0.25, 0.25), "memory": (128, 256),
                "min_containers": 0, "max_containers": 1, "buffer_containers": 0,
                "scaledown_window": 2, "timeout": 60, "startup_timeout": 60, "retries": 0})
            self.assertGreaterEqual(values["scaledown_window"], 2)
        source = SOURCE.read_text()
        self.assertIn("write_artifact.remote", source)
        self.assertIn("read_artifact.remote", source)
        self.assertIn("volume.commit()", source)
        self.assertIn("volume.reload()", source)

    def test_remote_functions_package_helper_on_the_shared_image(self):
        tree = ast.parse(SOURCE.read_text())
        assignments = [node for node in tree.body if isinstance(node, ast.Assign)
                       and any(isinstance(target, ast.Name) and target.id == "image"
                               for target in node.targets)]
        self.assertEqual(len(assignments), 1)
        image_call = assignments[0].value
        self.assertIsInstance(image_call, ast.Call)
        self.assertIsInstance(image_call.func, ast.Attribute)
        self.assertEqual(image_call.func.attr, "add_local_python_source")
        self.assertEqual(ast.literal_eval(image_call.args[0]), "modal_storage_proof_logic")

        function_calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                          and isinstance(node.func, ast.Attribute) and node.func.attr == "function"]
        self.assertEqual(len(function_calls), 4)
        for function_call in function_calls:
            image_kw = next((kw for kw in function_call.keywords if kw.arg == "image"), None)
            self.assertIsNotNone(image_kw)
            self.assertEqual(ast.dump(image_kw.value), ast.dump(ast.Name(id="image", ctx=ast.Load())))

    def test_staged_script_imports_helper_from_only_the_staged_sources(self):
        source_dir = SOURCE.parent
        with tempfile.TemporaryDirectory() as temp_dir:
            staged_dir = Path(temp_dir)
            shutil.copy2(SOURCE, staged_dir / SOURCE.name)
            helper_source = source_dir / "modal_storage_proof_logic.py"
            shutil.copy2(helper_source, staged_dir / helper_source.name)
            self.assertEqual({p.name for p in staged_dir.iterdir()},
                             {SOURCE.name, helper_source.name})

            class MockImage:
                def add_local_python_source(self, module_name):
                    self.packaged_module = module_name
                    return self

            class MockVolume:
                object_id = "local-test-volume"
                def commit(self): pass
                def reload(self): pass
                def hydrate(self): pass

            class MockApp:
                app_id = "local-test-app"
                function_images = []
                def function(self, **kwargs):
                    self.function_images.append(kwargs.get("image"))
                    return lambda fn: fn
                def local_entrypoint(self):
                    return lambda fn: fn

            mock_image = MockImage()
            mock_modal = types.ModuleType("modal")
            mock_modal.App = lambda name: MockApp()
            mock_modal.Image = types.SimpleNamespace(debian_slim=lambda: mock_image)
            mock_modal.Volume = types.SimpleNamespace(from_name=lambda *args, **kwargs: MockVolume())

            previous_modal = sys.modules.get("modal")
            previous_helper = sys.modules.pop("modal_storage_proof_logic", None)
            sys.modules["modal"] = mock_modal
            sys.path.insert(0, str(staged_dir))
            try:
                spec = importlib.util.spec_from_file_location(
                    "staged_modal_storage_proof", staged_dir / SOURCE.name)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                imported_helper = sys.modules["modal_storage_proof_logic"]
                self.assertEqual(Path(imported_helper.__file__).resolve(),
                                 (staged_dir / helper_source.name).resolve())
                self.assertEqual(mock_image.packaged_module, "modal_storage_proof_logic")
                self.assertEqual(len(module.app.function_images), 4)
                self.assertTrue(all(image is mock_image for image in module.app.function_images))
                for name in ("write_artifact", "read_artifact", "cleanup_artifact", "verify_absent"):
                    self.assertTrue(callable(getattr(module, name)))
            finally:
                sys.path.remove(str(staged_dir))
                sys.modules.pop("modal_storage_proof_logic", None)
                if previous_helper is not None:
                    sys.modules["modal_storage_proof_logic"] = previous_helper
                if previous_modal is None:
                    sys.modules.pop("modal", None)
                else:
                    sys.modules["modal"] = previous_modal


if __name__ == "__main__":
    unittest.main()
