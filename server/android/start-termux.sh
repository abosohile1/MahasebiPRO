#!/data/data/com.termux/files/usr/bin/bash
set -e
pkg update -y
pkg install -y nodejs
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "أنشئ ملف server/.env وضع MAHASEBI_SECRET بطول 32 حرفًا أو أكثر ثم أعد التشغيل."
  exit 1
fi
set -a
. ./.env
set +a
node server.js
