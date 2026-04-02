if [ -f /usr/lib/mcp-router/chrome-sandbox ]; then
  chown root:root /usr/lib/mcp-router/chrome-sandbox || true
  chmod 4755 /usr/lib/mcp-router/chrome-sandbox || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi
