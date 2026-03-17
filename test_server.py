#!/usr/bin/env python3
"""
🧪 Test Script for SSH Server Deploy Extension
Tests: Terminal-Output, Output-Files, Long-running execution (Stop Button)
"""

import os
import sys
import time
import json
import platform
import shutil
from datetime import datetime

# Terminal Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def separator():
    print(f"{CYAN}{'═' * 60}{RESET}")

def header(text):
    separator()
    print(f"{BOLD}{BLUE}  🧪 {text}{RESET}")
    separator()

# ─── Create Output Folder ───
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sshserver_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ═══════════════════════════════════════════════════════════
# TEST 1: Terminal-Output (stdout)
# ═══════════════════════════════════════════════════════════
header("TEST 1: Terminal-Output (stdout)")
print(f"{GREEN}✅ stdout works!{RESET}")
print(f"   Python Version: {sys.version}")
print(f"   Platform: {platform.platform()}")
print(f"   Hostname: {platform.node()}")
print(f"   Working Directory: {os.getcwd()}")
print(f"   Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()

# ═══════════════════════════════════════════════════════════
# TEST 2: Terminal-Output (stderr)
# ═══════════════════════════════════════════════════════════
header("TEST 2: Terminal-Output (stderr)")
print(f"{YELLOW}⚠️  This is a stderr message:{RESET}", file=sys.stderr)
print("   (If you see this in red, stderr is working!)", file=sys.stderr)
print()

# ═══════════════════════════════════════════════════════════
# TEST 3: Create files in output folder
# ═══════════════════════════════════════════════════════════
header("TEST 3: Creating Output Files")

# Text file
txt_path = os.path.join(OUTPUT_DIR, "result.txt")
with open(txt_path, "w") as f:
    f.write(f"Test Result from {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"Hostname: {platform.node()}\n")
    f.write(f"Python: {sys.version}\n")
    f.write("Status: All Good! ✅\n")
print(f"{GREEN}✅ result.txt created ({os.path.getsize(txt_path)} Bytes){RESET}")

# JSON file
json_path = os.path.join(OUTPUT_DIR, "data.json")
data = {
    "timestamp": datetime.now().isoformat(),
    "hostname": platform.node(),
    "tests_passed": 0,
    "tests_total": 5,
    "results": [
        {"name": "stdout", "status": "ok"},
        {"name": "stderr", "status": "ok"},
        {"name": "output_files", "status": "ok"},
    ]
}
with open(json_path, "w") as f:
    json.dump(data, f, indent=2)
print(f"{GREEN}✅ data.json created ({os.path.getsize(json_path)} Bytes){RESET}")

# CSV file
csv_path = os.path.join(OUTPUT_DIR, "metrics.csv")
with open(csv_path, "w") as f:
    f.write("time,cpu_dummy,ram_dummy,temperature\n")
    for i in range(20):
        import random
        f.write(f"{datetime.now().isoformat()},{random.randint(10,90)},{random.randint(30,80)},{random.uniform(35,75):.1f}\n")
print(f"{GREEN}✅ metrics.csv created ({os.path.getsize(csv_path)} Bytes){RESET}")

# Subdir with file
subdir = os.path.join(OUTPUT_DIR, "logs")
os.makedirs(subdir, exist_ok=True)
log_path = os.path.join(subdir, "test.log")
with open(log_path, "w") as f:
    f.write(f"[{datetime.now()}] Test script started\n")
    f.write(f"[{datetime.now()}] All tests passed\n")
print(f"{GREEN}✅ logs/test.log created ({os.path.getsize(log_path)} Bytes){RESET}")

print(f"\n   📁 Output Directory: {OUTPUT_DIR}")
print(f"   📄 Files: {len(os.listdir(OUTPUT_DIR))} items")
print()

# ═══════════════════════════════════════════════════════════
# TEST 4: Progress Bar (tests live stream performance)
# ═══════════════════════════════════════════════════════════
header("TEST 4: Live Streaming Progress")
print(f"{YELLOW}   Simulating a running task...{RESET}")
print()

total_steps = 20
for i in range(total_steps + 1):
    progress = i / total_steps
    bar_len = 40
    filled = int(bar_len * progress)
    bar = "█" * filled + "░" * (bar_len - filled)
    pct = progress * 100
    print(f"\r   [{bar}] {pct:5.1f}%  Step {i}/{total_steps}", end="", flush=True)
    time.sleep(0.3)

print(f"\n\n{GREEN}✅ Progress streaming works!{RESET}")
print()

# ═══════════════════════════════════════════════════════════
# TEST 5: Infinite Runner (to test the Stop button)
# ═══════════════════════════════════════════════════════════
header("TEST 5: Infinite Runner (Press STOP to terminate)")
print(f"{YELLOW}   This script is now running in an infinite loop.")
print(f"   → Test the STOP button in the sidebar!{RESET}")
print()

# Update Results
data["tests_passed"] = 5
data["tests_total"] = 5
data["results"].append({"name": "live_streaming", "status": "ok"})
data["results"].append({"name": "infinite_runner", "status": "ok"})
with open(json_path, "w") as f:
    json.dump(data, f, indent=2)

try:
    count = 0
    while True:
        count += 1
        now = datetime.now().strftime("%H:%M:%S")
        print(f"   ⏱  [{now}] Running for {count} second{'s' if count != 1 else ''}...", flush=True)
        time.sleep(1)
except KeyboardInterrupt:
    print(f"\n\n{GREEN}✅ Script stopped by KeyboardInterrupt{RESET}")

separator()
print(f"{BOLD}{GREEN}  🎉 All tests completed!{RESET}")
separator()
