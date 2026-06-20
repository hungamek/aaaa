@echo off
title TUBEFLOW AUTOMATION - Windows Baslatici
color 0C
cls

echo =======================================================================
echo               TUBEFLOW AUTOMATION - WINDOWS BASLATICI
echo =======================================================================
echo.
echo Bu betik, Tubeflow uygulamasini bilgisayarinizda otomatik olarak kurar,
echo derler ve tarayicinizda calistirir.
echo.
echo =======================================================================
echo.

:: 1. Node.js Kontrolu
echo [*] Node.js yuklenmesi kontrol ediliyor...
where node >nul 2>nul
if %errorlevel%==0 goto :node_ok
echo [HATA] Node.js bilgisayarinizda yuklu degil!
echo.
echo Lutfen asagidaki adresten Node.js LTS surumunu indirip kurun:
echo https://nodejs.org/
echo.
echo Kurulum bittikten sonra bu pencereyi kapatip, bu dosyayi tekrar calistirin.
pause
exit
:node_ok
echo [OK] Node.js algilandi. Surum:
node -v
echo.

:: 2. FFmpeg Kontrolu
echo [*] FFmpeg yuklenmesi kontrol ediliyor...
where ffmpeg >nul 2>nul
if %errorlevel%==0 goto :ffmpeg_ok
echo [UYARI] Sisteminizde genel bir FFmpeg binary'si bulunamadi.
echo Uygulama varsayilan olarak node_modules icindeki yerel binary'yi
echo kullanmaya calisacaktir. Eger canli yayinlarda sorun yasarsaniz,
echo Windows icin FFmpeg'i kurup sistem PATH yoluna eklemeniz gerekebilir.
echo.
goto :ffmpeg_done
:ffmpeg_ok
echo [OK] Sistem FFmpeg algilandi.
:ffmpeg_done
echo.

:: 3. Bagimliliklarin Kurulmasi
if exist node_modules goto :modules_ok
echo [*] Ilk kurulum yapiliyor (npm install)... Bu islem birkac dakika surebilir...
call npm install
goto :modules_done
:modules_ok
echo [*] Bagimliliklar zaten yuklu, kuruluma ihtiyac yok.
:modules_done
echo.

:: 4. Uygulamanin Derlenmesi
echo [*] Uygulama derleniyor (npm run build)...
call npm run build
if %errorlevel%==0 goto :build_ok
echo [HATA] Derleme sirasinda hata olustu. Baglantinizi ve node_modules klasorunu kontrol edin.
pause
exit
:build_ok
echo [OK] Derleme basariyla tamamlandi.
echo.

:: 5. Tarayiciyi Otomatik Acma ve Uygulamayi Baslatma
echo [*] Tubeflow sunucusu baslatiliyor...
echo Tarayiciniz otomatik olarak http://localhost:3000 adresini acacaktir.
echo.
echo Uygulamayi durdurmak icin bu pencereyi kapatabilir veya CTRL+C tuslarina basabilirsiniz.
echo =======================================================================
echo.

:: Tarayiciyi arka planda gecikmeli ac
start http://localhost:3000

:: Sunucuyu baslat
call npm run start

pause
