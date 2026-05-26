import sys
import os

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")

# Aggiunge la root di ai_service al path così i test possono importare da routers/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
