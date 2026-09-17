@echo off
cd /d "%~dp0"
node --preserve-symlinks-main --preserve-symlinks server.cjs
pause
