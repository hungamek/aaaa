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
if %errorlevel% neq 0 (
    echo [HATA] Node.js bilgisayarinizda yuklu degil!
    echo.
    echo Lutfen asagidaki adresten Node.js LTS surumunu indirip kurun:
    echo https://nodejs.org/
    echo.
    echo Kurulum bittikten sonra bu pencereyi kapatip, bu dosyayi (.bat) tekrar calistirin.
    pause
    exit
)
echo [OK] Node.js algilandi. Surum:
node -v
echo.

:: 2. FFmpeg Kontrolu
echo [*] FFmpeg yuklenmesi kontrol ediliyor...
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [UYARI] Sisteminizde genel bir FFmpeg binary'si bulunamadi.
    echo Uygulama varsayilan olarak node_modules icindeki yerel binary'yi
    echo kullanmaya calisacaktir. Eger canli yayinlarda sorun yasarsaniz,
    echo Windows icin FFmpeg'i kurup sistem PATH yoluna eklemeniz gerekebilir.
    echo.
) else (
    echo [OK] Sistem FFmpeg algilandi.
)
echo.

:: 3. Bagimliliklarin Kurulmasi
if not exist node_modules (
    echo [*] Ilk kurulum yapiliyor (npm install)... Bu islem birkac dakika surebilir...
    call npm install
) else (
    echo [*] Bagimliliklar zaten yuklu, kuruluma ihtiyac yok.
)
echo.

:: 4. Uygulamanin Derlenmesi
echo [*] Uygulama derleniyor (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo [HATA] Derleme sirasinda hata olustu. Baglantinizi ve node_modules klasorunu kontrol edin.
    pause
    exit
)
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
