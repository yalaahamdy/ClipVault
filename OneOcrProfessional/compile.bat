@echo off
echo === Compiling OneOCR Professional Suite ===
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /r:System.Drawing.dll /r:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationCore.dll /r:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationFramework.dll /r:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF\WindowsBase.dll /r:C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Xaml.dll /optimize+ /out:OneOcrSuiteProfessional.exe /target:winexe Core\Models.cs Core\NativeMethods.cs Core\OcrEngine.cs Core\AsyncLogger.cs App\Program.cs Gui\MainWindow.xaml.cs

if %ERRORLEVEL% EQU 0 (
    echo Compilation successful!
) else (
    echo Compilation failed!
    exit /b 1
)

echo === Copying dependencies ===
copy /y ..\oneocr.dll .
copy /y ..\oneocr.onemodel .
copy /y ..\onnxruntime.dll .
copy /y ..\opencv_world480.dll .
copy /y ..\opencv_core4.dll .
copy /y ..\opencv_imgproc4.dll .
copy /y ..\opencv_imgcodecs4.dll .
copy /y ..\msvcp140_app.dll .
copy /y ..\vcruntime140_app.dll .
copy /y ..\vcruntime140_1_app.dll .
copy /y ..\msvcp140_1_app.dll .
copy /y ..\msvcp140_2_app.dll .
copy /y ..\msvcp140_atomic_wait_app.dll .
copy /y ..\msvcp140_codecvt_ids_app.dll .
copy /y ..\concrt140_app.dll .
copy /y ..\vcamp140_app.dll .
copy /y ..\vccorlib140_app.dll .
copy /y ..\vcomp140_app.dll .

echo Dependencies copied successfully!
echo Ready to run OneOcrSuiteProfessional.exe
