import os
import sys
from pathlib import Path

os.environ["MOCK_MODE"] = "true"
os.environ["AUTH_DB_PATH"] = ":memory:"
os.environ["DATABASE_URL"] = ""
os.environ["DATA_ENCRYPTION_KEY"] = "dGVzdC1rZXktZm9yLXNha2hpLXRlc3RzLW9ubHktMzI="  # 32 bytes, tests only
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
