#!/usr/bin/env python3
"""
🧪 Test-Script für SSH Server Deploy Extension
Testet: Terminal-Output, Output-Dateien, lange Laufzeit (Stop-Button)
"""

import os
import sys
import time
import json
import platform
import shutil
from datetime import datetime

# Farben für Terminal
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

# ─── Output-Ordner erstellen ───
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sshserver_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ═══════════════════════════════════════════════════════════
# TEST 1: Terminal-Output (stdout)
# ═══════════════════════════════════════════════════════════
header("TEST 1: Terminal-Output (stdout)")
print(f"{GREEN}✅ stdout funktioniert!{RESET}")
print(f"   Python Version: {sys.version}")
print(f"   Platform: {platform.platform()}")
print(f"   Hostname: {platform.node()}")
print(f"   Arbeitsverzeichnis: {os.getcwd()}")
print(f"   Zeit: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()

# ═══════════════════════════════════════════════════════════
# TEST 2: Terminal-Output (stderr)
# ═══════════════════════════════════════════════════════════
header("TEST 2: Terminal-Output (stderr)")
print(f"{YELLOW}⚠️  Dies ist eine stderr-Nachricht:{RESET}", file=sys.stderr)
print("   (Wenn du das in rot siehst, funktioniert stderr!)", file=sys.stderr)
print()

# ═══════════════════════════════════════════════════════════
# TEST 3: Dateien im Output-Ordner erstellen
# ═══════════════════════════════════════════════════════════
header("TEST 3: Output-Dateien erstellen")

# Textdatei
txt_path = os.path.join(OUTPUT_DIR, "ergebnis.txt")
with open(txt_path, "w") as f:
    f.write(f"Test-Ergebnis vom {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"Hostname: {platform.node()}\n")
    f.write(f"Python: {sys.version}\n")
    f.write("Status: Alles OK! ✅\n")
print(f"{GREEN}✅ ergebnis.txt erstellt ({os.path.getsize(txt_path)} Bytes){RESET}")

# JSON-Datei
json_path = os.path.join(OUTPUT_DIR, "daten.json")
data = {
    "timestamp": datetime.now().isoformat(),
    "hostname": platform.node(),
    "tests_passed": 0,
    "tests_total": 5,
    "ergebnisse": [
        {"name": "stdout", "status": "ok"},
        {"name": "stderr", "status": "ok"},
        {"name": "output_files", "status": "ok"},
    ]
}
with open(json_path, "w") as f:
    json.dump(data, f, indent=2)
print(f"{GREEN}✅ daten.json erstellt ({os.path.getsize(json_path)} Bytes){RESET}")

# CSV-Datei
csv_path = os.path.join(OUTPUT_DIR, "messwerte.csv")
with open(csv_path, "w") as f:
    f.write("zeit,cpu_dummy,ram_dummy,temperatur\n")
    for i in range(20):
        import random
        f.write(f"{datetime.now().isoformat()},{random.randint(10,90)},{random.randint(30,80)},{random.uniform(35,75):.1f}\n")
print(f"{GREEN}✅ messwerte.csv erstellt ({os.path.getsize(csv_path)} Bytes){RESET}")

# Unterordner mit Datei
subdir = os.path.join(OUTPUT_DIR, "logs")
os.makedirs(subdir, exist_ok=True)
log_path = os.path.join(subdir, "test.log")
with open(log_path, "w") as f:
    f.write(f"[{datetime.now()}] Test-Script gestartet\n")
    f.write(f"[{datetime.now()}] Alle Tests bestanden\n")
print(f"{GREEN}✅ logs/test.log erstellt ({os.path.getsize(log_path)} Bytes){RESET}")

print(f"\n   📁 Output-Ordner: {OUTPUT_DIR}")
print(f"   📄 Dateien: {len(os.listdir(OUTPUT_DIR))} Einträge")
print()

# ═══════════════════════════════════════════════════════════
# TEST 4: Fortschritts-Anzeige (testet Live-Streaming)
# ═══════════════════════════════════════════════════════════
header("TEST 4: Live-Streaming Fortschritt")
print(f"{YELLOW}   Simuliere eine laufende Aufgabe...{RESET}")
print()

total_steps = 20
for i in range(total_steps + 1):
    progress = i / total_steps
    bar_len = 40
    filled = int(bar_len * progress)
    bar = "█" * filled + "░" * (bar_len - filled)
    pct = progress * 100
    print(f"\r   [{bar}] {pct:5.1f}%  Schritt {i}/{total_steps}", end="", flush=True)
    time.sleep(0.3)

print(f"\n\n{GREEN}✅ Fortschritts-Streaming funktioniert!{RESET}")
print()

# ═══════════════════════════════════════════════════════════
# TEST 5: Langläufer (zum Testen vom Stop-Button)
# ═══════════════════════════════════════════════════════════
header("TEST 5: Langläufer (drücke STOP zum Beenden)")
print(f"{YELLOW}   Dieses Script läuft jetzt in einer Endlosschleife.")
print(f"   → Teste den STOP-Button in der Sidebar!{RESET}")
print()

# Ergebnisse aktualisieren
data["tests_passed"] = 5
data["tests_total"] = 5
data["ergebnisse"].append({"name": "live_streaming", "status": "ok"})
data["ergebnisse"].append({"name": "langlaeufer", "status": "ok"})
with open(json_path, "w") as f:
    json.dump(data, f, indent=2)

try:
    count = 0
    while True:
        count += 1
        now = datetime.now().strftime("%H:%M:%S")
        print(f"   ⏱  [{now}] Läuft seit {count} Sekunde{'n' if count != 1 else ''}...", flush=True)
        time.sleep(1)
except KeyboardInterrupt:
    print(f"\n\n{GREEN}✅ Script wurde gestoppt (KeyboardInterrupt){RESET}")

separator()
print(f"{BOLD}{GREEN}  🎉 Alle Tests abgeschlossen!{RESET}")
separator()
