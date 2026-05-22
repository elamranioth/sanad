@echo off
cd /d "%~dp0"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=C:\Users\omran\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
start "Sanad local server" /min "%NODE_EXE%" "%~dp0sanad-local-server.js"
start "" "http://localhost:8787/sanad.html"
