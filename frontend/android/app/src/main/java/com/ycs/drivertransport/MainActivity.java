package com.ycs.drivertransport;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        android.webkit.WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.requestFocus();
        }
    }
}