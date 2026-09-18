using System;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing.Imaging;
using Microsoft.Win32;
using OneOcr.Core;
using OneOcr.App;
using Path = System.IO.Path;

namespace OneOcr.Gui {
    public partial class MainWindow : Window {
        // UI Palettes (Premium Dark Slate Theme)
        private static readonly Brush ColorSidebarBg = new SolidColorBrush(Color.FromRgb(15, 23, 42));       // Slate 900
        private static readonly Brush ColorContentBg = new SolidColorBrush(Color.FromRgb(30, 41, 59));       // Slate 800
        private static readonly Brush ColorCardBg = new SolidColorBrush(Color.FromRgb(15, 23, 42));          // Slate 900
        private static readonly Brush ColorAccent = new SolidColorBrush(Color.FromRgb(139, 92, 246));        // Violet 500
        private static readonly Brush ColorAccentHover = new SolidColorBrush(Color.FromRgb(124, 58, 237));   // Violet 600
        private static readonly Brush ColorBorder = new SolidColorBrush(Color.FromRgb(51, 65, 85));          // Slate 700
        private static readonly Brush ColorTextLight = new SolidColorBrush(Color.FromRgb(243, 244, 246));    // Gray 100
        private static readonly Brush ColorTextMuted = new SolidColorBrush(Color.FromRgb(156, 163, 175));    // Gray 400

        // Nav and Sidebar Controls
        private Button btnOcrStudio;
        private Button btnDevConsole;
        private Button btnLogs;
        private Ellipse elStatus;
        private TextBlock txtServerStatus;

        // Content Pages
        private Grid pageOcr;
        private Grid pageDev;
        private Grid pageLogs;

        // OCR Studio Components
        private Grid gridCanvasContainer;
        private StackPanel panelPlaceholder;
        private ScrollViewer scrollViewer;
        private Grid gridImageHost;
        private Image imgViewer;
        private Canvas canvasBoxes;

        // OCR Toolbar Controls
        private ComboBox comboReadingOrder;
        private CheckBox cbShowWords;
        private CheckBox cbShowLines;
        private Slider sliderConfidence;
        private TextBlock txtConfidenceValue;
        private Slider sliderZoom;
        private TextBlock txtZoomValue;
        private ScaleTransform zoomTransform;

        // OCR Output / Info
        private TextBox txtOcrResult;
        private TextBlock txtStats;
        private Button btnCopyAll;
        private Button btnSaveFile;
        private Button btnClearStudio;
        private Button btnBatchProcess;
        private Button btnStartServer;

        // Batch Progress Overlay
        private Grid gridBatchOverlay;
        private ProgressBar pbBatch;
        private TextBlock txtBatchProgress;
        private TextBox txtBatchLogs;

        // Logs Page
        private TextBox txtLiveLogs;
        private Button btnRefreshLogs;

        // Trace steps at bottom
        private Border step1Border, step2Border, step3Border, step4Border, step5Border;
        private TextBlock step1Text, step2Text, step3Text, step4Text, step5Text;

        // Engine and data state
        private OcrEngine ocrEngine;
        private string currentImagePath;
        private double scaleX = 1.0;
        private double scaleY = 1.0;
        private OcrResultData currentResult;
        private DispatcherTimer logUpdateTimer;

        public MainWindow() {
            InitializeComponent();
            SetupAppEvents();

            ocrEngine = new OcrEngine();
            ocrEngine.OnStepProgress += OcrEngine_OnStepProgress;

            // Log update timer
            logUpdateTimer = new DispatcherTimer();
            logUpdateTimer.Interval = TimeSpan.FromSeconds(1.5);
            logUpdateTimer.Tick += (s, e) => RefreshLogs();
            logUpdateTimer.Start();

            RefreshLogs();
        }

        private void SetupAppEvents() {
            this.AllowDrop = true;
            this.Drop += Window_Drop;
        }

        private void InitializeComponent() {
            // Window Configuration
            this.Title = "OneOCR Professional Dashboard";
            this.Height = 780;
            this.Width = 1200;
            this.Background = ColorContentBg;
            this.Foreground = ColorTextLight;
            this.WindowStartupLocation = WindowStartupLocation.CenterScreen;

            // Layout Transforms for zoom
            zoomTransform = new ScaleTransform(1.0, 1.0);

            // Main Grid
            Grid mainGrid = new Grid();
            mainGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(240) });
            mainGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) });
            this.Content = mainGrid;

            // ── SIDEBAR ──
            Border sidebarBorder = new Border() {
                Background = ColorSidebarBg,
                BorderBrush = ColorBorder,
                BorderThickness = new Thickness(0, 0, 1, 0)
            };
            Grid.SetColumn(sidebarBorder, 0);
            mainGrid.Children.Add(sidebarBorder);

            Grid sidebarGrid = new Grid() { Margin = new Thickness(15, 25, 15, 25) };
            sidebarGrid.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            sidebarGrid.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(1, GridUnitType.Star) });
            sidebarGrid.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            sidebarBorder.Child = sidebarGrid;

            // Logo & Title Section
            StackPanel logoPanel = new StackPanel() { Margin = new Thickness(0, 0, 0, 30) };
            
            // Try to load professional logo.png
            string logoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logo.png");
            if (File.Exists(logoPath)) {
                try {
                    BitmapImage logoImg = new BitmapImage();
                    logoImg.BeginInit();
                    logoImg.UriSource = new Uri(logoPath);
                    logoImg.CacheOption = BitmapCacheOption.OnLoad;
                    logoImg.EndInit();

                    Image imgLogo = new Image() {
                        Source = logoImg,
                        Height = 65,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Margin = new Thickness(0, 0, 0, 12)
                    };
                    logoPanel.Children.Add(imgLogo);
                } catch {
                    // Fallback to text
                }
            } else {
                // Placeholder elegant text logo
                TextBlock txtBigOcr = new TextBlock() {
                    Text = "OneOCR",
                    FontSize = 28,
                    FontWeight = FontWeights.ExtraBold,
                    Foreground = ColorAccent,
                    HorizontalAlignment = HorizontalAlignment.Center
                };
                logoPanel.Children.Add(txtBigOcr);
            }

            TextBlock txtLogoSub = new TextBlock() {
                Text = "PROFESSIONAL SUITE",
                FontSize = 10,
                FontWeight = FontWeights.Bold,
                Foreground = ColorTextMuted,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            logoPanel.Children.Add(txtLogoSub);
            Grid.SetRow(logoPanel, 0);
            sidebarGrid.Children.Add(logoPanel);

            // Navigation Panel
            StackPanel navPanel = new StackPanel();
            btnOcrStudio = CreateNavButton("📷  استوديو التعرف (OCR)", "ocr", true);
            btnDevConsole = CreateNavButton("🖥️  لوحة المطورين (API)", "dev", false);
            btnLogs = CreateNavButton("📝  سجلات النظام (Logs)", "logs", false);
            navPanel.Children.Add(btnOcrStudio);
            navPanel.Children.Add(btnDevConsole);
            navPanel.Children.Add(btnLogs);
            Grid.SetRow(navPanel, 1);
            sidebarGrid.Children.Add(navPanel);

            // Server Status Footer
            StackPanel footerPanel = new StackPanel() { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
            elStatus = new Ellipse() { Width = 9, Height = 9, Fill = Brushes.Crimson, Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center };
            txtServerStatus = new TextBlock() { Text = "خادم API: متوقف", FontSize = 12, Foreground = ColorTextMuted, VerticalAlignment = VerticalAlignment.Center };
            footerPanel.Children.Add(elStatus);
            footerPanel.Children.Add(txtServerStatus);
            Grid.SetRow(footerPanel, 2);
            sidebarGrid.Children.Add(footerPanel);

            // ── MAIN CONTENT CONTAINER ──
            Grid contentGrid = new Grid();
            Grid.SetColumn(contentGrid, 1);
            mainGrid.Children.Add(contentGrid);

            // ── PAGE 1: OCR STUDIO ──
            pageOcr = new Grid();
            pageOcr.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto }); // Toolbar
            pageOcr.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(1, GridUnitType.Star) }); // Viewport & Side Panel
            pageOcr.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(60) }); // Trace Steps
            contentGrid.Children.Add(pageOcr);

            // 1. OCR Toolbar
            Border toolbarBorder = new Border() {
                Background = ColorSidebarBg,
                BorderBrush = ColorBorder,
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(15, 10, 15, 10)
            };
            Grid.SetRow(toolbarBorder, 0);
            pageOcr.Children.Add(toolbarBorder);

            Grid toolbarGrid = new Grid();
            toolbarGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = GridLength.Auto }); // Reading order
            toolbarGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = GridLength.Auto }); // Toggles
            toolbarGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = GridLength.Auto }); // Confidence
            toolbarGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = GridLength.Auto }); // Zoom
            toolbarGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) }); // Spacer
            toolbarGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = GridLength.Auto }); // Rotate
            toolbarBorder.Child = toolbarGrid;

            // Reading Order Dropdown
            StackPanel roPanel = new StackPanel() { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 15, 0) };
            TextBlock lblRo = new TextBlock() { Text = "ترتيب القراءة:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0), Foreground = ColorTextMuted, FontSize = 12 };
            comboReadingOrder = new ComboBox() { Width = 170, Height = 28, Background = ColorContentBg, Foreground = ColorTextLight, BorderBrush = ColorBorder };
            comboReadingOrder.Items.Add(new ComboBoxItem() { Content = "تلقائي / يسار إلى يمين (LTR)", IsSelected = true });
            comboReadingOrder.Items.Add(new ComboBoxItem() { Content = "عربي / مانجا (RTL)" });
            comboReadingOrder.SelectionChanged += (s, e) => {
                if (ocrEngine != null) {
                    ocrEngine.RtlLayoutMode = comboReadingOrder.SelectedIndex == 1;
                    if (!string.IsNullOrEmpty(currentImagePath)) {
                        ProcessImageAsync(currentImagePath); // Re-process with new layout sorting
                    }
                }
            };
            roPanel.Children.Add(lblRo);
            roPanel.Children.Add(comboReadingOrder);
            Grid.SetColumn(roPanel, 0);
            toolbarGrid.Children.Add(roPanel);

            // Bounding Box Render Toggles
            StackPanel togglePanel = new StackPanel() { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 15, 0), VerticalAlignment = VerticalAlignment.Center };
            cbShowWords = new CheckBox() { Content = "إظهار الكلمات", IsChecked = true, Foreground = ColorTextLight, Margin = new Thickness(0, 0, 12, 0) };
            cbShowLines = new CheckBox() { Content = "إظهار الأسطر", IsChecked = true, Foreground = ColorTextLight };
            cbShowWords.Checked += (s, e) => RenderBoundingBoxes();
            cbShowWords.Unchecked += (s, e) => RenderBoundingBoxes();
            cbShowLines.Checked += (s, e) => RenderBoundingBoxes();
            cbShowLines.Unchecked += (s, e) => RenderBoundingBoxes();
            togglePanel.Children.Add(cbShowWords);
            togglePanel.Children.Add(cbShowLines);
            Grid.SetColumn(togglePanel, 1);
            toolbarGrid.Children.Add(togglePanel);

            // Confidence Filter Slider
            StackPanel confPanel = new StackPanel() { Orientation = Orientation.Horizontal, Margin = new Thickness(10, 0, 15, 0) };
            TextBlock lblConf = new TextBlock() { Text = "تصفية الثقة:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0), Foreground = ColorTextMuted, FontSize = 12 };
            sliderConfidence = new Slider() { Width = 100, Minimum = 0, Maximum = 100, Value = 40, VerticalAlignment = VerticalAlignment.Center };
            txtConfidenceValue = new TextBlock() { Text = "40%", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 0, 0), Foreground = ColorTextLight, Width = 30, FontSize = 12 };
            sliderConfidence.ValueChanged += (s, e) => {
                if (txtConfidenceValue != null) {
                    txtConfidenceValue.Text = Math.Round(sliderConfidence.Value) + "%";
                    RenderBoundingBoxes();
                }
            };
            confPanel.Children.Add(lblConf);
            confPanel.Children.Add(sliderConfidence);
            confPanel.Children.Add(txtConfidenceValue);
            Grid.SetColumn(confPanel, 2);
            toolbarGrid.Children.Add(confPanel);

            // Interactive Zoom Slider
            StackPanel zoomPanel = new StackPanel() { Orientation = Orientation.Horizontal, Margin = new Thickness(10, 0, 0, 0) };
            Button btnZoomOut = new Button() { Content = "➖", Width = 24, Height = 24, Background = ColorCardBg, Foreground = ColorTextLight, BorderBrush = ColorBorder, Cursor = Cursors.Hand };
            sliderZoom = new Slider() { Width = 100, Minimum = 10, Maximum = 400, Value = 100, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 6, 0) };
            Button btnZoomIn = new Button() { Content = "➕", Width = 24, Height = 24, Background = ColorCardBg, Foreground = ColorTextLight, BorderBrush = ColorBorder, Cursor = Cursors.Hand };
            txtZoomValue = new TextBlock() { Text = "100%", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 8, 0), Foreground = ColorTextLight, Width = 35, FontSize = 12 };
            Button btnZoomFit = new Button() { Content = "ملائمة", Height = 24, Padding = new Thickness(6, 0, 6, 0), Background = ColorCardBg, Foreground = ColorTextLight, BorderBrush = ColorBorder, Cursor = Cursors.Hand, FontSize = 11 };

            btnZoomOut.Click += (s, e) => sliderZoom.Value = Math.Max(10, sliderZoom.Value - 15);
            btnZoomIn.Click += (s, e) => sliderZoom.Value = Math.Min(400, sliderZoom.Value + 15);
            sliderZoom.ValueChanged += (s, e) => {
                double scale = sliderZoom.Value / 100.0;
                if (zoomTransform != null) {
                    zoomTransform.ScaleX = scale;
                    zoomTransform.ScaleY = scale;
                }
                if (txtZoomValue != null) txtZoomValue.Text = Math.Round(sliderZoom.Value) + "%";
            };
            btnZoomFit.Click += (s, e) => FitImageToScreen();

            zoomPanel.Children.Add(btnZoomOut);
            zoomPanel.Children.Add(sliderZoom);
            zoomPanel.Children.Add(btnZoomIn);
            zoomPanel.Children.Add(txtZoomValue);
            zoomPanel.Children.Add(btnZoomFit);
            Grid.SetColumn(zoomPanel, 3);
            toolbarGrid.Children.Add(zoomPanel);

            // Manual Rotate
            Button btnRotate = new Button() { Content = "🔄  تدوير 90°", Height = 28, Padding = new Thickness(10, 0, 10, 0), Background = ColorCardBg, Foreground = ColorTextLight, BorderBrush = ColorBorder, Cursor = Cursors.Hand, FontWeight = FontWeights.SemiBold };
            btnRotate.Click += RotateImage_Click;
            Grid.SetColumn(btnRotate, 5);
            toolbarGrid.Children.Add(btnRotate);

            // 2. OCR Main Studio Body
            Grid ocrStudioBodyGrid = new Grid();
            ocrStudioBodyGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(2.2, GridUnitType.Star) }); // Left Viewport
            ocrStudioBodyGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1.0, GridUnitType.Star) }); // Right Info Panel
            Grid.SetRow(ocrStudioBodyGrid, 1);
            pageOcr.Children.Add(ocrStudioBodyGrid);

            // Viewport Border
            Border viewportBorder = new Border() {
                Background = new SolidColorBrush(Color.FromRgb(15, 23, 42)), // Slate 900
                BorderBrush = ColorBorder,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Margin = new Thickness(15, 15, 10, 15)
            };
            Grid.SetColumn(viewportBorder, 0);
            ocrStudioBodyGrid.Children.Add(viewportBorder);

            gridCanvasContainer = new Grid() { ClipToBounds = true };
            viewportBorder.Child = gridCanvasContainer;

            // Drag and Drop Placeholder
            panelPlaceholder = new StackPanel() { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            TextBlock txtPlaceIcon = new TextBlock() { Text = "📥", FontSize = 65, HorizontalAlignment = HorizontalAlignment.Center, Foreground = ColorAccent, Margin = new Thickness(0, 0, 0, 15) };
            TextBlock txtPlaceMsg = new TextBlock() { Text = "اسحب وأفلت الصورة هنا للبدء الفوري", FontSize = 18, FontWeight = FontWeights.Bold, Foreground = ColorTextLight, HorizontalAlignment = HorizontalAlignment.Center };
            TextBlock txtPlaceSub = new TextBlock() { Text = "يدعم PNG, JPG, JPEG, BMP, TIFF", FontSize = 12, Foreground = ColorTextMuted, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 5, 0, 0) };
            panelPlaceholder.Children.Add(txtPlaceIcon);
            panelPlaceholder.Children.Add(txtPlaceMsg);
            panelPlaceholder.Children.Add(txtPlaceSub);
            gridCanvasContainer.Children.Add(panelPlaceholder);

            // Image Host Scroller
            scrollViewer = new ScrollViewer() {
                HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Visibility = Visibility.Collapsed
            };
            gridImageHost = new Grid() {
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                LayoutTransform = zoomTransform
            };
            imgViewer = new Image() { Stretch = Stretch.None };
            canvasBoxes = new Canvas() { HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };
            gridImageHost.Children.Add(imgViewer);
            gridImageHost.Children.Add(canvasBoxes);
            scrollViewer.Content = gridImageHost;
            gridCanvasContainer.Children.Add(scrollViewer);

            // Batch Overlay Panel (Invisible by default)
            gridBatchOverlay = new Grid() {
                Background = new SolidColorBrush(Color.FromArgb(235, 15, 23, 42)),
                Visibility = Visibility.Collapsed
            };
            StackPanel batchStack = new StackPanel() { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(40) };
            txtBatchProgress = new TextBlock() { Text = "جاري تحضير معالجة الدفعة...", FontSize = 16, FontWeight = FontWeights.Bold, Foreground = ColorTextLight, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 15) };
            pbBatch = new ProgressBar() { Height = 12, Minimum = 0, Maximum = 100, Value = 0, Foreground = ColorAccent, Background = ColorContentBg, BorderThickness = new Thickness(0) };
            txtBatchLogs = new TextBox() { Height = 150, Margin = new Thickness(0, 15, 0, 15), Background = ColorContentBg, Foreground = Brushes.LightGreen, BorderBrush = ColorBorder, IsReadOnly = true, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, FontFamily = new FontFamily("Consolas"), FontSize = 11, Padding = new Thickness(8) };
            Button btnCancelBatch = CreateStyledButton("إغلاق وإلغاء", Brushes.Crimson, new Thickness(0));
            btnCancelBatch.Click += (s, e) => { gridBatchOverlay.Visibility = Visibility.Collapsed; };
            batchStack.Children.Add(txtBatchProgress);
            batchStack.Children.Add(pbBatch);
            batchStack.Children.Add(txtBatchLogs);
            batchStack.Children.Add(btnCancelBatch);
            gridBatchOverlay.Children.Add(batchStack);
            gridCanvasContainer.Children.Add(gridBatchOverlay);

            // Right Panel: Results & Tools
            Border rightBorder = new Border() {
                Background = ColorCardBg,
                BorderBrush = ColorBorder,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Margin = new Thickness(5, 15, 15, 15),
                Padding = new Thickness(15)
            };
            Grid.SetColumn(rightBorder, 1);
            ocrStudioBodyGrid.Children.Add(rightBorder);

            Grid rightPanelGrid = new Grid();
            rightPanelGrid.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            rightPanelGrid.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(1, GridUnitType.Star) });
            rightPanelGrid.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            rightBorder.Child = rightPanelGrid;

            TextBlock txtResLabel = new TextBlock() { Text = "النص المستخرج", FontSize = 16, FontWeight = FontWeights.Bold, Foreground = ColorAccent, Margin = new Thickness(0, 0, 0, 10) };
            Grid.SetRow(txtResLabel, 0);
            rightPanelGrid.Children.Add(txtResLabel);

            txtOcrResult = new TextBox() {
                TextWrapping = TextWrapping.Wrap,
                AcceptsReturn = true,
                IsReadOnly = true,
                Background = ColorContentBg,
                Foreground = ColorTextLight,
                BorderBrush = ColorBorder,
                BorderThickness = new Thickness(1),
                FontSize = 13.5,
                Padding = new Thickness(10),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto
            };
            Grid.SetRow(txtOcrResult, 1);
            rightPanelGrid.Children.Add(txtOcrResult);

            // Sidebar Studio Actions
            StackPanel sideActionsPanel = new StackPanel() { Margin = new Thickness(0, 15, 0, 0) };
            btnCopyAll = CreateStyledButton("📋  نسخ النص المستخرج", ColorAccent, new Thickness(0, 0, 0, 8));
            btnSaveFile = CreateStyledButton("💾  حفظ كملف نصي (.txt)", ColorBorder, new Thickness(0, 0, 0, 8));
            
            Grid subActionsGrid = new Grid();
            subActionsGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) });
            subActionsGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) });
            btnClearStudio = CreateStyledButton("🗑️  مسح الاستوديو", new SolidColorBrush(Color.FromRgb(185, 28, 28)), new Thickness(0, 0, 4, 0));
            btnBatchProcess = CreateStyledButton("🗂️  معالجة دفعة صور", new SolidColorBrush(Color.FromRgb(30, 41, 59)), new Thickness(4, 0, 0, 0));
            Grid.SetColumn(btnClearStudio, 0);
            Grid.SetColumn(btnBatchProcess, 1);
            subActionsGrid.Children.Add(btnClearStudio);
            subActionsGrid.Children.Add(btnBatchProcess);

            txtStats = new TextBlock() { Text = "وقت المعالجة: - | زاوية الدوران: -", Margin = new Thickness(0, 12, 0, 0), FontSize = 11.5, Foreground = ColorTextMuted, HorizontalAlignment = HorizontalAlignment.Center };

            sideActionsPanel.Children.Add(btnCopyAll);
            sideActionsPanel.Children.Add(btnSaveFile);
            sideActionsPanel.Children.Add(subActionsGrid);
            sideActionsPanel.Children.Add(txtStats);
            Grid.SetRow(sideActionsPanel, 2);
            rightPanelGrid.Children.Add(sideActionsPanel);

            // Connect Events
            btnCopyAll.Click += CopyAll_Click;
            btnSaveFile.Click += SaveFile_Click;
            btnClearStudio.Click += ClearStudio_Click;
            btnBatchProcess.Click += BatchProcess_Click;

            // 3. Bottom Trace Steps
            Border traceBorder = new Border() {
                Background = ColorSidebarBg,
                BorderBrush = ColorBorder,
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(20, 8, 20, 8)
            };
            Grid.SetRow(traceBorder, 2);
            pageOcr.Children.Add(traceBorder);

            Grid traceGrid = new Grid();
            traceGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = GridLength.Auto });
            traceGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) });
            traceBorder.Child = traceGrid;

            TextBlock lblTraceTitle = new TextBlock() { Text = "تتبع المعالجة الحي:", VerticalAlignment = VerticalAlignment.Center, FontSize = 13, FontWeight = FontWeights.Bold, Foreground = ColorAccent, Margin = new Thickness(0, 0, 20, 0) };
            Grid.SetColumn(lblTraceTitle, 0);
            traceGrid.Children.Add(lblTraceTitle);

            StackPanel traceStepsStack = new StackPanel() { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            step1Border = CreateStepBubble("1", "تحميل المكتبات", out step1Text);
            step2Border = CreateStepBubble("2", "تجهيز البكسلات", out step2Text);
            step3Border = CreateStepBubble("3", "النموذج العصبي", out step3Text);
            step4Border = CreateStepBubble("4", "التحليل وقراءة البيانات", out step4Text);
            step5Border = CreateStepBubble("5", "الرسم والتصدير", out step5Text);

            traceStepsStack.Children.Add(step1Border);
            traceStepsStack.Children.Add(CreateTraceConnector());
            traceStepsStack.Children.Add(step2Border);
            traceStepsStack.Children.Add(CreateTraceConnector());
            traceStepsStack.Children.Add(step3Border);
            traceStepsStack.Children.Add(CreateTraceConnector());
            traceStepsStack.Children.Add(step4Border);
            traceStepsStack.Children.Add(CreateTraceConnector());
            traceStepsStack.Children.Add(step5Border);
            Grid.SetColumn(traceStepsStack, 1);
            traceGrid.Children.Add(traceStepsStack);

            // ── PAGE 2: DEVELOPER CONSOLE ──
            pageDev = new Grid() { Margin = new Thickness(25), Visibility = Visibility.Collapsed };
            pageDev.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            pageDev.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            pageDev.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(1, GridUnitType.Star) });
            contentGrid.Children.Add(pageDev);

            StackPanel devHeader = new StackPanel() { Margin = new Thickness(0, 0, 0, 20) };
            TextBlock txtDevTitle = new TextBlock() { Text = "لوحة خادم الويب المحلي (Local API Server)", FontSize = 22, FontWeight = FontWeights.Bold, Foreground = ColorAccent };
            TextBlock txtDevSub = new TextBlock() { Text = "تسمح لك هذه اللوحة بدمج محرك OneOCR مباشرة في برامجك ومواقعك عن طريق استدعاء خادم HTTP محلي.", FontSize = 13, Foreground = ColorTextMuted, Margin = new Thickness(0, 5, 0, 0) };
            devHeader.Children.Add(txtDevTitle);
            devHeader.Children.Add(txtDevSub);
            Grid.SetRow(devHeader, 0);
            pageDev.Children.Add(devHeader);

            Border devControlsBorder = new Border() { Background = ColorCardBg, BorderBrush = ColorBorder, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Padding = new Thickness(15), Margin = new Thickness(0, 0, 0, 20) };
            Grid.SetRow(devControlsBorder, 1);
            pageDev.Children.Add(devControlsBorder);

            Grid devControlsGrid = new Grid();
            devControlsGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) });
            devControlsGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = GridLength.Auto });
            devControlsBorder.Child = devControlsGrid;

            StackPanel serverUriPanel = new StackPanel() { VerticalAlignment = VerticalAlignment.Center };
            TextBlock txtServerUriLabel = new TextBlock() { Text = "عنوان الخدمة المحلي:", FontSize = 13, Foreground = ColorTextMuted };
            TextBlock txtServerUri = new TextBlock() { Text = "POST http://localhost:5050/api/ocr", FontSize = 16, FontWeight = FontWeights.Bold, Foreground = ColorTextLight, Margin = new Thickness(0, 5, 0, 0) };
            serverUriPanel.Children.Add(txtServerUriLabel);
            serverUriPanel.Children.Add(txtServerUri);
            Grid.SetColumn(serverUriPanel, 0);
            devControlsGrid.Children.Add(serverUriPanel);

            btnStartServer = CreateStyledButton("تشغيل خادم الويب", ColorAccent, new Thickness(0));
            btnStartServer.Width = 160;
            btnStartServer.Height = 40;
            btnStartServer.Click += ServerToggle_Click;
            Grid.SetColumn(btnStartServer, 1);
            devControlsGrid.Children.Add(btnStartServer);

            Grid devPanelsGrid = new Grid();
            devPanelsGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) });
            devPanelsGrid.ColumnDefinitions.Add(new ColumnDefinition() { Width = new GridLength(1, GridUnitType.Star) });
            Grid.SetRow(devPanelsGrid, 2);
            pageDev.Children.Add(devPanelsGrid);

            // Request Monitor Panel
            Border reqMonitorBorder = new Border() { Background = ColorCardBg, BorderBrush = ColorBorder, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Margin = new Thickness(0, 0, 10, 0), Padding = new Thickness(15) };
            Grid.SetColumn(reqMonitorBorder, 0);
            devPanelsGrid.Children.Add(reqMonitorBorder);

            Grid reqGrid = new Grid();
            reqGrid.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            reqGrid.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(1, GridUnitType.Star) });
            reqMonitorBorder.Child = reqGrid;

            TextBlock txtReqTitle = new TextBlock() { Text = "مراقب الطلبات الواردة (HTTP Requests)", FontSize = 14, FontWeight = FontWeights.Bold, Foreground = ColorAccent, Margin = new Thickness(0, 0, 0, 10) };
            Grid.SetRow(txtReqTitle, 0);
            reqGrid.Children.Add(txtReqTitle);

            listHttpRequests = new ListBox() { Background = ColorContentBg, BorderBrush = ColorBorder, Foreground = Brushes.LightGreen, FontSize = 12, Padding = new Thickness(5), FontFamily = new FontFamily("Consolas") };
            Grid.SetRow(listHttpRequests, 1);
            reqGrid.Children.Add(listHttpRequests);

            // Integration Panel
            Border integrationBorder = new Border() { Background = ColorCardBg, BorderBrush = ColorBorder, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Margin = new Thickness(10, 0, 0, 0), Padding = new Thickness(15) };
            Grid.SetColumn(integrationBorder, 1);
            devPanelsGrid.Children.Add(integrationBorder);

            Grid integGrid = new Grid();
            integGrid.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            integGrid.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(1, GridUnitType.Star) });
            integrationBorder.Child = integGrid;

            TextBlock txtIntegTitle = new TextBlock() { Text = "دليل المطورين السريع (Integration Guide)", FontSize = 14, FontWeight = FontWeights.Bold, Foreground = ColorAccent, Margin = new Thickness(0, 0, 0, 10) };
            Grid.SetRow(txtIntegTitle, 0);
            integGrid.Children.Add(txtIntegTitle);

            TextBox txtIntegGuide = new TextBox() {
                TextWrapping = TextWrapping.NoWrap,
                AcceptsReturn = true,
                IsReadOnly = true,
                Background = ColorContentBg,
                Foreground = new SolidColorBrush(Color.FromRgb(147, 197, 253)), // Blue 300
                BorderBrush = ColorBorder,
                FontSize = 11.5,
                FontFamily = new FontFamily("Consolas"),
                Padding = new Thickness(8),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
                Text = "# 1. Python Requests Example\nimport requests\nurl = 'http://localhost:5050/api/ocr'\nwith open('image.jpg', 'rb') as f:\n    r = requests.post(url, data=f)\nprint(r.json())\n\n# 2. Curl Command (Binary Post)\ncurl -X POST --data-binary @image.jpg http://localhost:5050/api/ocr\n\n# 3. Query Parameter File Path\ncurl http://localhost:5050/api/ocr?path=C:/images/image.jpg"
            };
            Grid.SetRow(txtIntegGuide, 1);
            integGrid.Children.Add(txtIntegGuide);

            // ── PAGE 3: SYSTEM LOGS ──
            pageLogs = new Grid() { Margin = new Thickness(25), Visibility = Visibility.Collapsed };
            pageLogs.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            pageLogs.RowDefinitions.Add(new RowDefinition() { Height = new GridLength(1, GridUnitType.Star) });
            pageLogs.RowDefinitions.Add(new RowDefinition() { Height = GridLength.Auto });
            contentGrid.Children.Add(pageLogs);

            TextBlock txtLogsTitle = new TextBlock() { Text = "سجل التتبع وتفاصيل العمليات (Logs)", FontSize = 22, FontWeight = FontWeights.Bold, Foreground = ColorAccent, Margin = new Thickness(0, 0, 0, 20) };
            Grid.SetRow(txtLogsTitle, 0);
            pageLogs.Children.Add(txtLogsTitle);

            txtLiveLogs = new TextBox() { TextWrapping = TextWrapping.NoWrap, AcceptsReturn = true, IsReadOnly = true, Background = ColorCardBg, Foreground = Brushes.LawnGreen, BorderBrush = ColorBorder, BorderThickness = new Thickness(1), FontSize = 12.5, FontFamily = new FontFamily("Consolas"), Padding = new Thickness(12), VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto };
            Grid.SetRow(txtLiveLogs, 1);
            pageLogs.Children.Add(txtLiveLogs);

            btnRefreshLogs = CreateStyledButton("تحديث السجل يدوياً", ColorBorder, new Thickness(0, 15, 0, 0));
            btnRefreshLogs.Width = 140;
            btnRefreshLogs.HorizontalAlignment = HorizontalAlignment.Right;
            btnRefreshLogs.Click += (s, e) => RefreshLogs();
            Grid.SetRow(btnRefreshLogs, 2);
            pageLogs.Children.Add(btnRefreshLogs);
        }

        // ── BUTTON HELPER CREATORS ──
        private Button CreateNavButton(string content, string tag, bool isActive) {
            Button btn = new Button() {
                Content = content,
                Tag = tag,
                Background = isActive ? ColorSidebarBg : Brushes.Transparent,
                Foreground = isActive ? ColorTextLight : ColorTextMuted,
                FontSize = 13.5,
                Height = 44,
                Margin = new Thickness(0, 4, 0, 4),
                Padding = new Thickness(15, 0, 0, 0),
                HorizontalContentAlignment = HorizontalAlignment.Left,
                BorderThickness = isActive ? new Thickness(3, 0, 0, 0) : new Thickness(0),
                BorderBrush = isActive ? ColorAccent : Brushes.Transparent,
                Cursor = Cursors.Hand
            };

            // Custom Template to support nice styling and corner highlights
            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory borderFactory = new FrameworkElementFactory(typeof(Border));
            borderFactory.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Button.BackgroundProperty));
            borderFactory.SetValue(Border.BorderThicknessProperty, new TemplateBindingExtension(Button.BorderThicknessProperty));
            borderFactory.SetValue(Border.BorderBrushProperty, new TemplateBindingExtension(Button.BorderBrushProperty));
            borderFactory.SetValue(Border.CornerRadiusProperty, new CornerRadius(isActive ? 0 : 6));

            FrameworkElementFactory presenterFactory = new FrameworkElementFactory(typeof(ContentPresenter));
            presenterFactory.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            presenterFactory.SetValue(ContentPresenter.MarginProperty, new Thickness(12, 0, 0, 0));
            borderFactory.AppendChild(presenterFactory);

            template.VisualTree = borderFactory;
            btn.Template = template;

            btn.Click += Nav_Click;

            // Hover styles
            btn.MouseEnter += (s, e) => {
                if (btn.Background == Brushes.Transparent) {
                    btn.Background = new SolidColorBrush(Color.FromArgb(15, 255, 255, 255));
                    btn.Foreground = ColorTextLight;
                }
            };
            btn.MouseLeave += (s, e) => {
                if (btn.Tag.ToString() != GetActiveTabTag()) {
                    btn.Background = Brushes.Transparent;
                    btn.Foreground = ColorTextMuted;
                }
            };

            return btn;
        }

        private string GetActiveTabTag() {
            if (pageOcr.Visibility == Visibility.Visible) return "ocr";
            if (pageDev.Visibility == Visibility.Visible) return "dev";
            return "logs";
        }

        private Button CreateStyledButton(string content, Brush background, Thickness margin) {
            Button btn = new Button() {
                Content = content,
                Background = background,
                Foreground = ColorTextLight,
                Margin = margin,
                Height = 35,
                BorderThickness = new Thickness(0),
                FontWeight = FontWeights.Bold,
                Cursor = Cursors.Hand
            };

            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory borderFactory = new FrameworkElementFactory(typeof(Border));
            borderFactory.SetValue(Border.CornerRadiusProperty, new CornerRadius(6));
            borderFactory.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Button.BackgroundProperty));

            FrameworkElementFactory presenterFactory = new FrameworkElementFactory(typeof(ContentPresenter));
            presenterFactory.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            presenterFactory.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            borderFactory.AppendChild(presenterFactory);

            template.VisualTree = borderFactory;
            btn.Template = template;

            btn.MouseEnter += (s, e) => btn.Opacity = 0.85;
            btn.MouseLeave += (s, e) => btn.Opacity = 1.0;

            return btn;
        }

        private Border CreateStepBubble(string num, string title, out TextBlock outputText) {
            Border bubble = new Border() {
                Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)), // slate 700
                Height = 30,
                CornerRadius = new CornerRadius(15),
                Padding = new Thickness(12, 0, 12, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            outputText = new TextBlock() {
                Text = string.Format("{0}. {1}", num, title),
                Foreground = ColorTextMuted,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            };
            bubble.Child = outputText;
            return bubble;
        }

        private Line CreateTraceConnector() {
            return new Line() {
                X1 = 0, Y1 = 0, X2 = 25, Y2 = 0,
                Stroke = new SolidColorBrush(Color.FromRgb(51, 65, 85)),
                StrokeThickness = 2,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(5, 0, 5, 0)
            };
        }

        // ── IMAGE NAVIGATION & TABS ──
        private void Nav_Click(object sender, RoutedEventArgs e) {
            Button clicked = (Button)sender;
            string tag = clicked.Tag.ToString();

            // Reset navigation colors
            btnOcrStudio.Background = Brushes.Transparent; btnOcrStudio.Foreground = ColorTextMuted; btnOcrStudio.BorderThickness = new Thickness(0);
            btnDevConsole.Background = Brushes.Transparent; btnDevConsole.Foreground = ColorTextMuted; btnDevConsole.BorderThickness = new Thickness(0);
            btnLogs.Background = Brushes.Transparent; btnLogs.Foreground = ColorTextMuted; btnLogs.BorderThickness = new Thickness(0);

            // Activate clicked
            clicked.Background = ColorSidebarBg;
            clicked.Foreground = ColorTextLight;
            clicked.BorderThickness = new Thickness(3, 0, 0, 0);
            clicked.BorderBrush = ColorAccent;

            // Page Visibilities
            pageOcr.Visibility = tag == "ocr" ? Visibility.Visible : Visibility.Collapsed;
            pageDev.Visibility = tag == "dev" ? Visibility.Visible : Visibility.Collapsed;
            pageLogs.Visibility = tag == "logs" ? Visibility.Visible : Visibility.Collapsed;

            if (tag == "logs") RefreshLogs();
        }

        // ── DRAG AND DROP ──
        private void Window_Drop(object sender, DragEventArgs e) {
            if (e.Data.GetDataPresent(DataFormats.FileDrop)) {
                string[] files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files.Length > 0 && IsImageFile(files[0])) {
                    Nav_Click(btnOcrStudio, new RoutedEventArgs());
                    ProcessImageAsync(files[0]);
                }
            }
        }

        private bool IsImageFile(string path) {
            string ext = Path.GetExtension(path).ToLower();
            return ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".bmp" || ext == ".tiff";
        }

        // ── OCR ENGINE PROCESSING ──
        private async void ProcessImageAsync(string imagePath) {
            currentImagePath = imagePath;
            panelPlaceholder.Visibility = Visibility.Collapsed;
            scrollViewer.Visibility = Visibility.Visible;
            canvasBoxes.Children.Clear();
            txtOcrResult.Text = "جاري قراءة الصورة وتطبيق خوارزميات التعرف الضوئي...";
            txtStats.Text = "وقت المعالجة: جاري التشغيل... | زاوية الدوران: -";

            // Load Image
            BitmapImage bitImg = new BitmapImage();
            bitImg.BeginInit();
            bitImg.UriSource = new Uri(imagePath);
            bitImg.CacheOption = BitmapCacheOption.OnLoad;
            bitImg.EndInit();
            imgViewer.Source = bitImg;

            var watch = Stopwatch.StartNew();
            try {
                // Ensure Layout Mode property is synced
                ocrEngine.RtlLayoutMode = comboReadingOrder.SelectedIndex == 1;

                currentResult = await Task.Run(() => ocrEngine.ProcessImage(imagePath));
            } catch (Exception ex) {
                MessageBox.Show("حدث خطأ في محرك التعرف الضوئي:\n" + ex.Message, "OCR Error", MessageBoxButton.OK, MessageBoxImage.Error);
                txtOcrResult.Text = "فشلت عملية التعرف على النصوص.";
                return;
            }
            watch.Stop();

            txtOcrResult.Text = currentResult.text;
            txtStats.Text = string.Format("وقت المعالجة: {0} ms | زاوية الدوران: {1:F1}° | عدد الكلمات: {2}", watch.ElapsedMilliseconds, currentResult.angle, GetWordCount(currentResult));

            // Wait for display boundaries
            Dispatcher.BeginInvoke(new Action(() => {
                // Set default scale based on image dimensions
                scaleX = bitImg.Width / bitImg.PixelWidth;
                scaleY = bitImg.Height / bitImg.PixelHeight;
                FitImageToScreen();
            }), DispatcherPriority.Loaded);
        }

        private int GetWordCount(OcrResultData res) {
            int cnt = 0;
            foreach (var l in res.lines) cnt += l.words.Count;
            return cnt;
        }

        private void FitImageToScreen() {
            if (imgViewer.Source == null) return;
            double viewerWidth = scrollViewer.ActualWidth - 20;
            double viewerHeight = scrollViewer.ActualHeight - 20;
            if (viewerWidth <= 0 || viewerHeight <= 0) return;

            double scaleXRatio = viewerWidth / imgViewer.Source.Width;
            double scaleYRatio = viewerHeight / imgViewer.Source.Height;
            double bestScale = Math.Min(scaleXRatio, scaleYRatio);

            // Clamp between 10% and 400%
            sliderZoom.Value = Math.Max(10, Math.Min(400, bestScale * 100));
        }

        // ── RENDER BOUNDING BOXES ──
        private void RenderBoundingBoxes() {
            canvasBoxes.Children.Clear();
            if (imgViewer.Source == null || currentResult == null) return;

            canvasBoxes.Width = imgViewer.Source.Width;
            canvasBoxes.Height = imgViewer.Source.Height;

            double confidenceFilter = sliderConfidence.Value;
            bool showWords = cbShowWords.IsChecked == true;
            bool showLines = cbShowLines.IsChecked == true;

            // Render Lines (Green boxes)
            if (showLines) {
                foreach (var line in currentResult.lines) {
                    // Check average confidence for line
                    double avgConf = GetLineAverageConfidence(line);
                    if (avgConf * 100 < confidenceFilter) continue;

                    Polygon linePoly = CreateBoundingPolygon(line.bbox, true, line.text, avgConf);
                    canvasBoxes.Children.Add(linePoly);
                }
            }

            // Render Words (Violet boxes)
            if (showWords) {
                foreach (var line in currentResult.lines) {
                    foreach (var word in line.words) {
                        if (word.confidence * 100 < confidenceFilter) continue;

                        Polygon wordPoly = CreateBoundingPolygon(word.bbox, false, word.text, word.confidence);
                        canvasBoxes.Children.Add(wordPoly);
                    }
                }
            }
        }

        private double GetLineAverageConfidence(LineData line) {
            if (line.words == null || line.words.Count == 0) return 0.8;
            double sum = 0;
            foreach (var w in line.words) sum += w.confidence;
            return sum / line.words.Count;
        }

        private Polygon CreateBoundingPolygon(BoundingBox box, bool isLine, string text, double confidence) {
            Polygon poly = new Polygon();
            poly.Points.Add(new System.Windows.Point(box.x1 * scaleX, box.y1 * scaleY));
            poly.Points.Add(new System.Windows.Point(box.x2 * scaleX, box.y2 * scaleY));
            poly.Points.Add(new System.Windows.Point(box.x3 * scaleX, box.y3 * scaleY));
            poly.Points.Add(new System.Windows.Point(box.x4 * scaleX, box.y4 * scaleY));

            Brush strokeBrush = isLine ? new SolidColorBrush(Color.FromArgb(80, 16, 185, 129)) : new SolidColorBrush(Color.FromArgb(80, 139, 92, 246));
            Brush fillBrush = isLine ? new SolidColorBrush(Color.FromArgb(12, 16, 185, 129)) : new SolidColorBrush(Color.FromArgb(12, 139, 92, 246));
            Brush hoverStroke = isLine ? new SolidColorBrush(Color.FromRgb(16, 185, 129)) : new SolidColorBrush(Color.FromRgb(139, 92, 246));
            Brush hoverFill = isLine ? new SolidColorBrush(Color.FromArgb(40, 16, 185, 129)) : new SolidColorBrush(Color.FromArgb(40, 139, 92, 246));

            poly.Stroke = strokeBrush;
            poly.StrokeThickness = 1.0;
            poly.Fill = fillBrush;
            poly.Cursor = Cursors.Hand;

            ToolTip tt = new ToolTip() {
                Background = ColorSidebarBg,
                Foreground = ColorTextLight,
                BorderBrush = ColorBorder,
                Content = string.Format("النوع: {0}\nالنص: {1}\nنسبة الثقة: {2:P1}", isLine ? "سطر" : "كلمة", text, confidence)
            };
            poly.ToolTip = tt;

            poly.MouseEnter += (s, e) => {
                poly.Stroke = hoverStroke;
                poly.StrokeThickness = 2.0;
                poly.Fill = hoverFill;
                // Put polygon on top of drawing stack
                Canvas.SetZIndex(poly, 100);
            };

            poly.MouseLeave += (s, e) => {
                poly.Stroke = strokeBrush;
                poly.StrokeThickness = 1.0;
                poly.Fill = fillBrush;
                Canvas.SetZIndex(poly, 0);
            };

            poly.MouseDown += (s, e) => {
                Clipboard.SetText(text);
                txtStats.Text = "تم نسخ المربع المختار: [" + text + "]";
                e.Handled = true;
            };

            return poly;
        }

        // ── ROTATE IMAGE ──
        private void RotateImage_Click(object sender, RoutedEventArgs e) {
            if (string.IsNullOrEmpty(currentImagePath) || !File.Exists(currentImagePath)) return;
            try {
                // Ensure unique rotation temp path
                string tempDir = Path.Combine(Path.GetTempPath(), "OneOcrRotate");
                if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);

                string tempPath = Path.Combine(tempDir, "rotated_" + Guid.NewGuid().ToString() + ".png");
                using (System.Drawing.Bitmap bmp = new System.Drawing.Bitmap(currentImagePath)) {
                    bmp.RotateFlip(System.Drawing.RotateFlipType.Rotate90FlipNone);
                    bmp.Save(tempPath, System.Drawing.Imaging.ImageFormat.Png);
                }

                // Process rotated image path
                ProcessImageAsync(tempPath);
            } catch (Exception ex) {
                MessageBox.Show("فشل تدوير الصورة:\n" + ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // ── OCR STEPS PROGRESS UPDATES ──
        private void OcrEngine_OnStepProgress(string step, long elapsedMs) {
            Dispatcher.BeginInvoke(new Action(() => {
                if (step.Contains("تحميل المكتبات")) {
                    ResetStepGlows();
                    GlowStep(step1Border, step1Text, elapsedMs);
                } else if (step.Contains("تجهيز البكسلات")) {
                    GlowStep(step2Border, step2Text, elapsedMs);
                } else if (step.Contains("النموذج العصبي")) {
                    GlowStep(step3Border, step3Text, elapsedMs);
                } else if (step.Contains("التحليل")) {
                    GlowStep(step4Border, step4Text, elapsedMs);
                } else if (step.Contains("الرسم") || step.Contains("اكتمال")) {
                    GlowStep(step5Border, step5Text, elapsedMs);
                    RenderBoundingBoxes(); // Automatically render once complete!
                }
            }));
        }

        private void ResetStepGlows() {
            step1Border.Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)); step1Text.Foreground = ColorTextMuted; step1Text.Text = "1. تحميل المكتبات";
            step2Border.Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)); step2Text.Foreground = ColorTextMuted; step2Text.Text = "2. تجهيز البكسلات";
            step3Border.Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)); step3Text.Foreground = ColorTextMuted; step3Text.Text = "3. النموذج العصبي";
            step4Border.Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)); step4Text.Foreground = ColorTextMuted; step4Text.Text = "4. التحليل وقراءة البيانات";
            step5Border.Background = new SolidColorBrush(Color.FromRgb(51, 65, 85)); step5Text.Foreground = ColorTextMuted; step5Text.Text = "5. الرسم والتصدير";
        }

        private void GlowStep(Border border, TextBlock textBlock, long elapsedMs) {
            border.Background = ColorAccent;
            textBlock.Foreground = ColorTextLight;
            // Append timing to bubble text
            string baseText = textBlock.Text;
            if (baseText.Contains("(")) baseText = baseText.Substring(0, baseText.IndexOf("(") - 1);
            textBlock.Text = string.Format("{0} ({1}ms)", baseText, elapsedMs);
        }

        // ── OCR BOTTOM ACTIONS ──
        private void CopyAll_Click(object sender, RoutedEventArgs e) {
            if (!string.IsNullOrEmpty(txtOcrResult.Text)) {
                Clipboard.SetText(txtOcrResult.Text);
                MessageBox.Show("تم نسخ النص بالكامل إلى الحافظة!", "Success", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void SaveFile_Click(object sender, RoutedEventArgs e) {
            if (string.IsNullOrEmpty(txtOcrResult.Text)) return;
            SaveFileDialog sfd = new SaveFileDialog() {
                Filter = "Text Files (*.txt)|*.txt|All Files (*.*)|*.*",
                Title = "حفظ النص المستخرج",
                FileName = "OCR_Result"
            };
            if (sfd.ShowDialog() == true) {
                try {
                    File.WriteAllText(sfd.FileName, txtOcrResult.Text, Encoding.UTF8);
                    MessageBox.Show("تم حفظ الملف بنجاح!", "Saved", MessageBoxButton.OK, MessageBoxImage.Information);
                } catch (Exception ex) {
                    MessageBox.Show("فشل حفظ الملف:\n" + ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private void ClearStudio_Click(object sender, RoutedEventArgs e) {
            currentImagePath = null;
            currentResult = null;
            imgViewer.Source = null;
            canvasBoxes.Children.Clear();
            txtOcrResult.Clear();
            txtStats.Text = "وقت المعالجة: - | زاوية الدوران: -";
            panelPlaceholder.Visibility = Visibility.Visible;
            scrollViewer.Visibility = Visibility.Collapsed;
            ResetStepGlows();
        }

        // ── BATCH PROCESS ──
        private async void BatchProcess_Click(object sender, RoutedEventArgs e) {
            OpenFileDialog ofd = new OpenFileDialog() {
                Multiselect = true,
                Filter = "Image Files (*.png;*.jpg;*.jpeg;*.bmp;*.tiff)|*.png;*.jpg;*.jpeg;*.bmp;*.tiff",
                Title = "اختر الصور لمعالجتها كدفعة واحدة"
            };

            if (ofd.ShowDialog() == true) {
                string[] files = ofd.FileNames;
                if (files.Length == 0) return;

                // Show Batch Progress Overlay
                gridBatchOverlay.Visibility = Visibility.Visible;
                pbBatch.Maximum = files.Length;
                pbBatch.Value = 0;
                txtBatchLogs.Clear();
                
                txtBatchLogs.AppendText(string.Format("بدء معالجة دفعة جديدة تحتوي على {0} صور...\n", files.Length));

                int successCount = 0;
                int failCount = 0;

                await Task.Run(() => {
                    for (int i = 0; i < files.Length; i++) {
                        string file = files[i];
                        string fileName = Path.GetFileName(file);
                        int currentIdx = i + 1;

                        Dispatcher.Invoke(() => {
                            txtBatchProgress.Text = string.Format("جاري معالجة الصورة: {0} ({1} من {2})...", fileName, currentIdx, files.Length);
                            txtBatchLogs.AppendText(string.Format("[{0}/{1}] جاري معالجة: {2}...\n", currentIdx, files.Length, fileName));
                            txtBatchLogs.ScrollToEnd();
                        });

                        try {
                            // Run OCR
                            OcrResultData res = ocrEngine.ProcessImage(file);
                            
                            // Save companion text file
                            string txtPath = Path.ChangeExtension(file, ".txt");
                            File.WriteAllText(txtPath, res.text, Encoding.UTF8);

                            successCount++;
                            Dispatcher.Invoke(() => {
                                txtBatchLogs.AppendText(string.Format("  ✔️ تم بنجاح! تم حفظ الملف في: {0}\n", Path.GetFileName(txtPath)));
                                pbBatch.Value = currentIdx;
                            });
                        } catch (Exception ex) {
                            failCount++;
                            Dispatcher.Invoke(() => {
                                txtBatchLogs.AppendText(string.Format("  ❌ فشل: {0}\n", ex.Message));
                                pbBatch.Value = currentIdx;
                            });
                        }
                    }
                });

                txtBatchProgress.Text = "اكتملت معالجة الدفعة!";
                txtBatchLogs.AppendText(string.Format("\nالمحصلة النهائية: نجاح {0} | فشل {1}\n", successCount, failCount));
                txtBatchLogs.ScrollToEnd();
            }
        }

        // ── LOCAL SERVER WEB REST API CONTROLS ──
        private void ServerToggle_Click(object sender, RoutedEventArgs e) {
            if (btnStartServer.Content.ToString() == "تشغيل خادم الويب") {
                Task.Run(() => {
                    Program.RunServer("5050");
                });

                btnStartServer.Content = "إيقاف خادم الويب";
                btnStartServer.Background = Brushes.Crimson;
                txtServerStatus.Text = "خادم API: نشط (Port 5050)";
                elStatus.Fill = Brushes.LawnGreen;
            } else {
                Program.StopServer();
                btnStartServer.Content = "تشغيل خادم الويب";
                btnStartServer.Background = ColorAccent;
                txtServerStatus.Text = "خادم API: متوقف";
                elStatus.Fill = Brushes.Crimson;
            }
        }

        private ListBox listHttpRequests;
        private void RefreshLogs() {
            // Update HTTP logs in background
            string logPath = "oneocr_suite_log.txt";
            if (File.Exists(logPath)) {
                try {
                    string[] lines = File.ReadAllLines(logPath);
                    int start = Math.Max(0, lines.Length - 100);
                    StringBuilder sb = new StringBuilder();
                    
                    // Fill HTTP logs in Dev Console
                    List<string> httpRequests = new List<string>();
                    for (int i = start; i < lines.Length; i++) {
                        string line = lines[i];
                        sb.AppendLine(line);
                        
                        if (line.Contains("طلب وارد") || line.Contains("HTTP")) {
                            httpRequests.Add(line);
                        }
                    }

                    if (txtLiveLogs != null) {
                        txtLiveLogs.Text = sb.ToString();
                        txtLiveLogs.ScrollToEnd();
                    }

                    if (listHttpRequests != null && httpRequests.Count > 0) {
                        listHttpRequests.Items.Clear();
                        // Get latest 15 requests
                        int reqStart = Math.Max(0, httpRequests.Count - 15);
                        for (int j = reqStart; j < httpRequests.Count; j++) {
                            listHttpRequests.Items.Add(httpRequests[j]);
                        }
                    }
                } catch {
                    if (txtLiveLogs != null) txtLiveLogs.Text = "فشل تحميل ملف سجل التتبع حالياً.";
                }
            } else {
                if (txtLiveLogs != null) txtLiveLogs.Text = "لا توجد سجلات حالية.";
            }
        }

        protected override void OnClosed(EventArgs e) {
            base.OnClosed(e);
            logUpdateTimer.Stop();
            Program.StopServer();
            if (ocrEngine != null) {
                ocrEngine.Dispose();
                ocrEngine = null;
            }
            Environment.Exit(0);
        }
    }
}
