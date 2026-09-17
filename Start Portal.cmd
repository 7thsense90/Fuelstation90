@echo off
cd /d "%~dp0"
if exist .env (
  node --env-file=.env --preserve-symlinks-main --preserve-symlinks server.cjs
) else (
  node --preserve-symlinks-main --preserve-symlinks server.cjs
)
pause
