"""Source-checkout stdio launcher; packaged Windows uses NPCsAIStudio.exe --mcp."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from ludo_npc.mcp_server import main

if __name__ == "__main__":
    main()
