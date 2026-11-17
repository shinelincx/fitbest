import os
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path


REMOTE = Path(__file__).with_name("github-actions-remote.sh")


class DeploymentTest(unittest.TestCase):
    def test_first_deployment_requires_existing_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path / ".env").write_text("POSTGRES_PASSWORD=original\n")
            archive = path / "upload.tar"
            env = path / "new.env"
            env.write_text("POSTGRES_PASSWORD=different\n")
            with tarfile.open(archive, "w") as tar:
                tar.add(env, arcname=".env")
            result = subprocess.run(
                ["bash", str(REMOTE), str(path), str(archive), "server", "ghcr.io/example/test", "sha-test", "1", "1"],
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("requires FITBEST_PRODUCTION_ENV to match", result.stderr)
            self.assertEqual((path / ".env").read_text(), "POSTGRES_PASSWORD=original\n")
            self.assertFalse((path / ".fitbest-current").exists())
            self.assertFalse(archive.exists())

    def test_success_and_failed_health_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            bin_dir = path / "bin"
            bin_dir.mkdir()
            for name, content in {
                "docker": "#!/bin/sh\necho \"$*\" >> \"$DOCKER_LOG\"\ncase \"$*\" in *' port fitbest-server 8080') echo 0.0.0.0:9090;; esac\n",
                "curl": "#!/bin/sh\nexit ${FAIL_CURL:-0}\n",
            }.items():
                executable = bin_dir / name
                executable.write_text(content)
                executable.chmod(0o755)
            env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", DOCKER_LOG=str(path / "docker.log"))
            config = path / ".env"
            config.write_text("POSTGRES_PASSWORD=original\n")
            for run, fail in (("1", False), ("2", True)):
                archive = path / f"upload-{run}.tar"
                with tarfile.open(archive, "w") as tar:
                    tar.add(config, arcname=".env")
                result = subprocess.run(
                    ["bash", str(REMOTE), str(path), str(archive), "server", "ghcr.io/example/test", "sha-test", run, "1"],
                    env=dict(env, FAIL_CURL="1" if fail else "0"), capture_output=True, text=True,
                )
                self.assertEqual(result.returncode == 0, not fail, result.stderr)
                self.assertEqual((path / ".fitbest-current").resolve(), path / ".fitbest-releases/1-1")
                self.assertFalse(archive.exists())
            docker_calls = (path / "docker.log").read_text()
            self.assertIn("image inspect ghcr.io/example/test-server:sha-test ghcr.io/example/test-web:sha-test", docker_calls)
            self.assertIn("up --no-build --pull never", docker_calls)
            config.write_text("POSTGRES_PASSWORD=changed\n")
            archive = path / "upload-3.tar"
            with tarfile.open(archive, "w") as tar:
                tar.add(config, arcname=".env")
            result = subprocess.run(
                ["bash", str(REMOTE), str(path), str(archive), "server", "ghcr.io/example/test", "sha-test", "3", "1"],
                env=env, capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("separate database password migration", result.stderr)
            self.assertEqual((path / ".fitbest-current").resolve(), path / ".fitbest-releases/1-1")


if __name__ == "__main__":
    unittest.main()
