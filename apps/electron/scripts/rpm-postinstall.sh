if [ -f /usr/lib/mcp-router/chrome-sandbox ]; then
  chown root:root /usr/lib/mcp-router/chrome-sandbox || true
  chmod 4755 /usr/lib/mcp-router/chrome-sandbox || true
fi
