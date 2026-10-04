package com.ycs.drivertransport;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * طباعة ومشاركة الملفات من داخل التطبيق.
 *
 * المشكلة التي يحلها:
 * 1) window.open("", "_blank") داخل WebView كاباسيتور ينشئ نافذة جديدة لا يستطيع
 *    المستخدم العودة منها إلى التطبيق — فيبقى محتجزاً في شاشة التقرير.
 *    لذلك نطبع عبر PrintManager (نافذة طباعة النظام) التي يمكن إغلاقها والعودة
 *    منها للتطبيق بزر الرجوع.
 * 2) window.open(dataUrl, "_system") لا يعمل لأن روابط data: لا تفتح في المتصفح
 *    الخارجي، فنكتب الملف فعلياً في cacheDir ونفتحه عبر FileProvider.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.requestFocus();
            webView.addJavascriptInterface(new NativeBridge(), "DriverApp");
        }
    }

    private class NativeBridge {

        @JavascriptInterface
        public boolean canPrint() {
            return true;
        }

        /** يفتح نافذة طباعة النظام (يمكن اختيار «حفظ كـ PDF») — بلا نوافذ ويب جديدة. */
        @JavascriptInterface
        public void printHtml(final String jobName, final String html) {
            final String title = (jobName == null || jobName.trim().isEmpty()) ? "Report" : jobName.trim();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        print(title, html == null ? "" : html);
                    } catch (Throwable t) {
                        toast("تعذر فتح نافذة الطباعة: " + t.getMessage());
                    }
                }
            });
        }

        /** يحفظ الملف في ذاكرة التطبيق ثم يفتحه بالتطبيق المناسب (Excel/PDF) أو يعرض مساره. */
        @JavascriptInterface
        public void openFile(final String fileName, final String mime, final String base64) {
            final String name = safeName(fileName);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        File dir = new File(getCacheDir(), "exports");
                        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("mkdir failed");
                        File out = new File(dir, name);
                        byte[] data;
                        try {
                            data = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
                        } catch (IllegalArgumentException e) {
                            data = new byte[0];
                        }
                        OutputStream os = new FileOutputStream(out);
                        try {
                            os.write(data);
                        } finally {
                            os.close();
                        }
                        openWithExternalApp(out, mime);
                    } catch (Throwable t) {
                        toast("تعذر حفظ الملف: " + t.getMessage());
                    }
                }
            });
        }

        @JavascriptInterface
        public void shareText(final String subject, final String text) {
            final String body = text == null ? "" : text;
            final String title = subject == null ? "" : subject;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType("text/plain");
                        send.putExtra(Intent.EXTRA_SUBJECT, title);
                        send.putExtra(Intent.EXTRA_TEXT, body);
                        startActivity(Intent.createChooser(send, title.isEmpty() ? "مشاركة" : title));
                    } catch (Throwable t) {
                        toast("تعذرت المشاركة: " + t.getMessage());
                    }
                }
            });
        }

        @JavascriptInterface
        public void notify(final String message) {
            final String msg = message == null ? "" : message;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    toast(msg);
                }
            });
        }
    }

    /** يبني WebView مخفياً (لازم أن يكون ضمن شجرة العرض لينجح توليد مستند الطباعة) ثم يستدعي PrintManager. */
    private void print(String jobName, String html) {
        final PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        if (pm == null) {
            toast("الجهاز لا يدعم الطباعة");
            return;
        }
        ViewGroup root = (ViewGroup) findViewById(android.R.id.content);
        final WebView printer = new WebView(this);
        printer.setLayoutParams(new ViewGroup.LayoutParams(1, 1));
        printer.setVisibility(View.INVISIBLE);
        printer.getSettings().setJavaScriptEnabled(false);
        root.addView(printer);

        printer.setWebViewClient(new WebViewClient() {
            private boolean done = false;

            @Override
            public void onPageFinished(WebView view, String url) {
                if (done) return;
                done = true;
                printer.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            PrintAttributes attrs = new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                    .build();
                            pm.print(jobName, printer.createPrintDocumentAdapter(jobName), attrs);
                        } catch (Throwable t) {
                            toast("تعذر فتح نافذة الطباعة: " + t.getMessage());
                        }
                        releasePrinter(printer);
                    }
                }, 400);
            }
        });
        printer.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private void releasePrinter(WebView printer) {
        try {
            printer.postDelayed(new Runnable() {
                @Override
                public void run() {
                    ViewGroup root = (ViewGroup) findViewById(android.R.id.content);
                    if (root != null) root.removeView(printer);
                    printer.destroy();
                }
            }, 60000);
        } catch (Throwable ignored) {
            // تجاهل: التنظيف ليس حرجاً
        }
    }

    private void openWithExternalApp(File file, String mime) {
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (view.resolveActivity(getPackageManager()) != null) {
                startActivity(view);
                return;
            }
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/octet-stream");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (send.resolveActivity(getPackageManager()) != null) {
                startActivity(Intent.createChooser(send, "مشاركة الملف"));
                return;
            }
            toast("تم حفظ الملف في: " + file.getAbsolutePath());
        } catch (Throwable t) {
            toast("تعذر فتح الملف: " + t.getMessage());
        }
    }

    private static String safeName(String fileName) {
        String base = (fileName == null || fileName.trim().isEmpty()) ? "report" : fileName.trim();
        base = base.replaceAll("[\\\\/:*?\"<>|]", "_");
        return base.length() > 80 ? base.substring(0, 80) : base;
    }

    private void toast(String message) {
        if (message == null || message.isEmpty()) return;
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}