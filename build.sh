#!/bin/sh
# Junta os módulos em app.js (o site usa só o app.js)
cd "$(dirname "$0")" && cat src/*.js > app.js && node --check app.js && echo "app.js gerado"
