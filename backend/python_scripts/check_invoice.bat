@echo off
REM --- Manual Invoice Checker for Windows ---
REM Usage: Drag and drop an invoice file onto this script,
REM OR run from the command line: check_invoice.bat "C:\path\to\your\invoice.jpeg"

REM Check if a file path was provided
IF "%~1"=="" (
    echo No file path provided.
    echo Usage: check_invoice.bat "path\to\your\file.jpeg"
    pause
    exit /b
)

echo.
echo ========================================
echo  BETA SUITE - AI INVOICE CHECKER
echo ========================================
echo.
echo Activating virtual environment...

REM Activate the Python virtual environment
CALL "%~dp0venv\Scripts\activate.bat"

echo.
echo Processing file: %1
echo.
echo --- AI JSON Output ---

REM Run the main Python script with the provided file path
python "%~dp0main.py" %1

echo.
echo ----------------------
echo.
echo Deactivating virtual environment...
deactivate
echo.
echo Done.
pause