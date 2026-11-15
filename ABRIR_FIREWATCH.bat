@echo off
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 goto python
py -3 servidor.py --abrir
goto fin
:python
python servidor.py --abrir
:fin
pause
