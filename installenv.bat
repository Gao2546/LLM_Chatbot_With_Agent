@echo off
REM Check if Python is installed
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Python is not installed. Please install Python and try again.
    exit /b 1
)

REM Create folder .env and change directory into it
mkdir env
cd env

REM Create virtual environment named pytorch
python -m venv pytorch

REM Change back to the original directory
cd ..

REM Activate the virtual environment
call env\pytorch\Scripts\activate

REM Install the required packages
pip install -r requirement.txt

REM
python -m ipykernel install --user --name=pytorch --display-name "Python (pytorch)"

REM Deactivate the virtual environment
deactivate

echo Virtual environment setup complete.
