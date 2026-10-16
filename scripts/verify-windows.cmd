@echo off
setlocal
pushd "%~dp0.."
if errorlevel 1 exit /b 1

pushd engine
call mvnw.cmd verify
set "clientCheckExit=%ERRORLEVEL%"
popd
if not "%clientCheckExit%"=="0" goto failed

call npm.cmd ci --ignore-scripts
if errorlevel 1 goto failed
call npm.cmd test
if errorlevel 1 goto failed
call npm.cmd run stage:engine
if errorlevel 1 goto failed
call npm.cmd run test:engine
if errorlevel 1 goto failed
call npm.cmd run build:frontend
if errorlevel 1 goto failed

pushd desktop
cargo test --locked
set "clientCheckExit=%ERRORLEVEL%"
popd
if not "%clientCheckExit%"=="0" goto failed

echo Java, frontend and native contract checks completed successfully.
popd
exit /b 0

:failed
echo Verification stopped at the first failed command. Later checks were not executed.
popd
exit /b 1
