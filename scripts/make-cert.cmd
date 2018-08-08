@ECHO OFF
SETLOCAL

REM https://stackoverflow.com/questions/10175812/how-to-create-a-self-signed-certificate-with-openssl
REM https://stackoverflow.com/questions/21297139/how-do-you-sign-a-certificate-signing-request-with-your-certification-authority

REM Check for elevation.
CALL "%~dp0check-make-cert.cmd"
IF NOT ERRORLEVEL 2 EXIT /B
net file > NUL 2> NUL
IF ERRORLEVEL 1 (
	ECHO Certificate creation will continue in an elevated command prompt.
	cscript //nologo "%~dp0elevate.vbs" "%~f0 %~1"
	EXIT /B
) ELSE IF "%~1" == "" (
	SET PAUSE=PAUSE
) ELSE (
	SET PAUSE=
)

REM Create and switch to the temporary directory.
SET T=%TEMP%\mkc%RANDOM%
MD "%T%"
SET D=%~dp0
CD /D %T%

REM Determine if openssl needs to run to create the certificates.
SET NEEDS_INSTALLATION=YES
SET SSL=%D%..\ssl
SET HAS_ALL_FILES=NO
IF EXIST "%SSL%\cacert.crt" IF EXIST "%SSL%\cacert.key" (
	IF EXIST "%SSL%\selfsigned.crt" IF EXIST "%SSL%\selfsigned.key" (
		IF EXIST "%SSL%\server.crt" IF EXIST "%SSL%\server.key" SET HAS_ALL_FILES=YES
	)
)
IF "%HAS_ALL_FILES%" == "YES" (
	REM The certificates have been previously created.  Determine if the CA certificate needs installation.
	powershell -Command "& {Get-ChildItem -Path Cert:\LocalMachine\Root}" | FIND "Twitch Developer Rig CA" > NUL
	IF NOT ERRORLEVEL 1 SET NEEDS_INSTALLATION=NO
) ELSE (
	REM Create the certificates.
	CALL :create
	IF ERRORLEVEL 1 GOTO done
)

REM Copy localhost certificates to the extension conf directory.
SET CONF=%D%..\..\my-extension\conf
IF NOT EXIST "%CONF%" MD "%CONF%"
COPY /Y "%SSL%\server.*" "%CONF%" > NUL
IF ERRORLEVEL 1 (
	ECHO Cannot place the extension server certificates.
	GOTO done
)

REM Import the CA certificate into the local machine's root certificate store.
SET FF=%ProgramFiles%\Mozilla Firefox\defaults\pref
IF NOT EXIST "%FF%" SET FF=%ProgramFiles(x86)%\Mozilla Firefox\defaults\pref
IF "%NEEDS_INSTALLATION%" == "YES" (
	certutil -Enterprise -addstore Root "%SSL%\cacert.crt"
	IF ERRORLEVEL 1 (
		ECHO Cannot import the CA certificate into the local machine's root certificate store.
		GOTO done
	)

	REM If Firefox is installed, allow it to use the certificates in the local machine's root certificate store.
	IF EXIST "%FF%" (
		ECHO pref^("security.enterprise_roots.enabled", true^); > "%FF%\twitch-developer-rig.js"
	)

	REM The user must restart their browser for these changes to take effect.
	IF "%~1" == "" (
		ECHO NOTE:  you must restart your browser before running the Developer Rig.
	) ELSE (
		ECHO NOTE:  you must restart your browser before continuing.
	)
	SET PAUSE=PAUSE
)

:done
SET EXIT_CODE=%ERRORLEVEL%
CD /D %D%
RD /Q /S "%T%"
%PAUSE%
EXIT /B %EXIT_CODE%

:create
REM Configure path to OpenSSL.
openssl version 2> NUL > NUL
IF ERRORLEVEL 1 PATH %PATH%;%ProgramFiles%\Git\mingw64\bin
openssl version 2> NUL > NUL
IF ERRORLEVEL 1 (
	ECHO Cannot configure path to OpenSSL.
	EXIT /B 1
)

REM Prepare input files.
COPY "%D%*.cnf" > NUL
COPY /B NUL index.txt > NUL
openssl rand -hex 4 > serial.txt
IF ERRORLEVEL 1 (
	ECHO Cannot create certificate serial number.
	EXIT /B 1
)
FOR /L %%I IN (1,1,7) DO ECHO.>> enters.txt
FOR /L %%I IN (1,1,2) DO ECHO y>> yes.txt
SET CA=openssl-ca.cnf

REM Create the certificate authority certificate.
openssl req -x509 -days 99999 -config %CA% -newkey rsa:4096 -sha256 -nodes -out cacert.pem -outform PEM < enters.txt
IF ERRORLEVEL 1 (
	ECHO Cannot create the certificate authority certificate.
	EXIT /B 1
)

REM Create the certificate requests for the Developer Rig and localhost.
ECHO DNS.1 = localhost.rig.twitch.tv> rig.dns
ECHO DNS.1 = localhost> localhost.dns
FOR %%I IN (rig localhost) DO (
	DEL openssl-server.cnf
	COPY /B "%D%openssl-server.cnf"+%%I.dns openssl-server.cnf > NUL
	openssl req -config openssl-server.cnf -newkey rsa:2048 -sha256 -nodes -out %%Icert.csr -outform PEM < enters.txt
	IF ERRORLEVEL 1 (
		ECHO Cannot create the %%I certificate request.
		EXIT /B 1
	)
	REN serverkey.pem %%Ikey.pem
)

REM Create the server certificates for the Developer Rig and localhost.
DEL %CA%
COPY /B "%D%%CA%"+"%D%openssl-ca.add" %CA%
ECHO unique_subject = no> index.txt.attr
FOR %%I IN (rig localhost) DO (
	openssl ca -config %CA% -policy signing_policy -extensions signing_req -out %%Icert.pem -infiles %%Icert.csr < yes.txt
	IF ERRORLEVEL 1 (
		ECHO Cannot create the %%I server certificate.
		EXIT /B 1
	)
)

REM Move all desired files to the Developer Rig ssl directory.
MOVE /Y cacert.pem "%SSL%\cacert.crt" > NUL
MOVE /Y cakey.pem "%SSL%\cacert.key" > NUL
MOVE /Y rigcert.pem "%SSL%\selfsigned.crt" > NUL
MOVE /Y rigkey.pem "%SSL%\selfsigned.key" > NUL
MOVE /Y localhostcert.pem "%SSL%\server.crt" > NUL
MOVE /Y localhostkey.pem "%SSL%\server.key" > NUL
IF ERRORLEVEL 1 (
	ECHO Cannot place the Developer Rig certificates.
	EXIT /B 1
)
