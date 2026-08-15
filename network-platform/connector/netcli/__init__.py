"""netcli — an MCP network-CLI connector for the AI-native network platform.

"Just connect": provide a host (IP or hostname) from the topology map's
inventory, and the connector logs in (SSH/telnet, multi-vendor) and pulls
state. Credentials come from a secrets store — never from the map or git.

Core modules (stdlib-only, runnable offline in mock mode):
    inventory   — load the topology map's device list; filter by role/site/vendor
    credentials — resolve secrets from env/vault; reject secrets stored in the map
    transport   — Scrapli/Netmiko abstraction + a MockTransport for offline runs
    baselines   — role -> baseline command set (from the net-login-and-baseline skill)

Edge module (needs the `mcp` package):
    server      — the MCP server exposing list_devices / run / run_on_many / baseline
"""

__version__ = "0.1.0"
