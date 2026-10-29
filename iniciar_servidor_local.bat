@echo off
title Servidor Local - OCR de Facturas
echo ====================================================
echo  Iniciando servidor local en http://localhost:8000
echo ====================================================
start http://localhost:8000
python -m http.server 8000
pause
