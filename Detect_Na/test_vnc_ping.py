"""
test_vnc_ping.py — ทดสอบ Ping + VNC Port ของเครื่องจักรที่เคยตั้งค่าไว้ใน DB
ใช้: python test_vnc_ping.py
"""

import subprocess
import socket
import sys
import os
import platform

# Add dashboard backend to path for db_helper
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "dashboard", "backend"))

# ─── VNC ports to try ───
VNC_PORTS = [5900, 5901, 59000, 59001, 5800]


def ping(ip, timeout=2):
    """Ping an IP address. Returns (ok, latency_ms_or_error)."""
    param = "-n" if platform.system().lower() == "windows" else "-c"
    timeout_flag = "-w" if platform.system().lower() == "windows" else "-W"
    timeout_val = str(timeout * 1000) if platform.system().lower() == "windows" else str(timeout)

    try:
        result = subprocess.run(
            ["ping", param, "1", timeout_flag, timeout_val, ip],
            capture_output=True, text=True, timeout=timeout + 3
        )
        if result.returncode == 0:
            # Extract latency from output
            output = result.stdout
            for line in output.splitlines():
                if "time=" in line.lower() or "time<" in line.lower():
                    for part in line.split():
                        if part.lower().startswith("time=") or part.lower().startswith("time<"):
                            ms = part.split("=")[-1].replace("ms", "").replace("<", "")
                            return True, f"{ms}ms"
            return True, "OK"
        return False, "Unreachable"
    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def check_port(ip, port, timeout=2):
    """Check if a TCP port is open."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()
        return result == 0
    except Exception:
        return False


def load_machines():
    """Load machines from PostgreSQL via db_helper."""
    try:
        import db_helper
        if not db_helper.test_connection():
            print("[!] Cannot connect to PostgreSQL — check DB settings")
            return {}
        return db_helper.get_all_machines_dict()
    except ImportError:
        print("[!] Cannot import db_helper")
        return {}
    except Exception as e:
        print(f"[!] DB error: {e}")
        return {}


def test_single(ip, port=0):
    """Test a single IP — ping + VNC port scan."""
    print(f"\n--- Testing {ip} ---\n")

    # Ping
    ping_ok, ping_info = ping(ip)
    print(f"  Ping : {'OK (' + ping_info + ')' if ping_ok else 'FAIL (' + ping_info + ')'}")

    if not ping_ok:
        print("  VNC  : skipped (ping failed)")
        return

    # VNC port check
    if port and check_port(ip, port):
        print(f"  VNC  : port {port} OPEN")
        return

    print(f"  Scanning common VNC ports: {VNC_PORTS} ...")
    found = False
    for p in VNC_PORTS:
        if check_port(ip, p):
            print(f"  VNC  : port {p} OPEN")
            found = True
    if not found:
        print("  VNC  : all ports CLOSED")


def try_vnc_connect(ip, port, password):
    """Try actual VNC authentication using realtime_monitor's vnc_screenshot."""
    print(f"\n--- VNC Connect Test ({ip}:{port or 'auto'}) ---\n")
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "."))
        from realtime_monitor import vnc_screenshot, detect_vnc_port

        if not port:
            print("  Auto-detecting port...")
            port = detect_vnc_port(ip) or 5900
            print(f"  Detected port: {port}")

        print(f"  Connecting to {ip}:{port} ...")
        img = vnc_screenshot(ip, port, password, timeout=10)
        if img is not None:
            h, w = img.shape[:2]
            print(f"  VNC Connected! Screen: {w}x{h}")
        else:
            print("  VNC Connect FAILED (no image returned)")
    except ImportError:
        print("  realtime_monitor not available, skipping VNC auth test")
    except Exception as e:
        print(f"  VNC Connect FAILED: {e}")


def main():
    print("=" * 50)
    print("  VNC Single Machine Test")
    print("=" * 50)

    ip = input("\n  IP address : ").strip()
    if not ip:
        print("  No IP entered, exit.")
        return

    port_str = input("  VNC port (Enter=auto scan) : ").strip()
    port = int(port_str) if port_str.isdigit() else 0

    password = input("  VNC password (Enter=skip) : ").strip()

    test_single(ip, port)

    # Try VNC connect if password provided
    if password:
        try_vnc_connect(ip, port, password)
    print("\nDone.")


if __name__ == "__main__":
    main()
