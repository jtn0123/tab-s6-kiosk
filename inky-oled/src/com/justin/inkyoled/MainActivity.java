package com.justin.inkyoled;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Fullscreen kiosk shell for the wall panel dashboard.
 *
 * Everything the dashboard needs is bundled in assets/ — it runs standalone with no
 * Raspberry Pi and no local server. The only network call is the weather fetch, which the
 * dashboard makes directly to Open-Meteo (no API key).
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        // A wall panel should never sleep while it is showing.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // assets are local; allow the page to fetch the weather API
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);

        // keep navigation inside the WebView — no stray browser launches on a wall panel
        web.setWebViewClient(new WebViewClient());
        web.setBackgroundColor(0xFF000000);

        setContentView(web);
        // NOTE: assets are kept FLAT (no subdirectory). aapt2 on Windows writes subdirectory
        // separators as backslashes ("assets/dashboard\index.html"), which android_asset URLs
        // cannot resolve. Keeping everything at the assets root sidesteps that entirely.
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    /** Immersive: no status bar, no nav bar. Re-applied on focus because Android restores them. */
    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** Back button should not leave the dashboard. */
    @Override
    public void onBackPressed() {
        // intentionally does nothing
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
