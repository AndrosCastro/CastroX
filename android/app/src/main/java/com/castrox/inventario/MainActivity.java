package com.castrox.inventario;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Arrays;

/**
 * CastroX para Android: carga la aplicación web del servidor configurado en un WebView
 * y agrega funciones nativas (cámara, guardar archivos en Descargas, impresión).
 */
public class MainActivity extends Activity {

    private static final String PREFS = "castrox";
    private static final String KEY_SERVER = "server";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String SETUP_URL = "https://" + ASSET_HOST + "/assets/setup.html";
    private static final int REQ_CAMERA = 10;
    private static final int REQ_STORAGE = 11;

    private WebView web;
    private WebViewAssetLoader assetLoader;
    private PermissionRequest pendingCameraRequest;
    private Runnable pendingStorageAction;
    private WebView printView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " CastroXApp/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Bridge(), "CastroXApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> openExternal(Uri.parse(url)));

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            start();
        }
    }

    // ------------------------------------------------------------------ Servidor

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String getServer() {
        return prefs().getString(KEY_SERVER, BuildConfig.DEFAULT_SERVER);
    }

    private String serverHost() {
        String server = getServer();
        if (server == null || server.isEmpty()) return "";
        String host = Uri.parse(server).getHost();
        return host == null ? "" : host;
    }

    /** Convierte lo que escribe el usuario en "https://host[:puerto]" o null si no es válido. */
    static String normalize(String input) {
        if (input == null) return null;
        String v = input.trim();
        if (v.isEmpty()) return null;
        if (!v.matches("(?i)^https?://.*")) v = "https://" + v;
        Uri u = Uri.parse(v);
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        if (u.getHost() == null || u.getHost().isEmpty() || !(scheme.equals("https") || scheme.equals("http"))) return null;
        String out = scheme + "://" + u.getHost().toLowerCase();
        if (u.getPort() > 0) out += ":" + u.getPort();
        return out;
    }

    private void start() {
        String server = getServer();
        if (server == null || server.isEmpty()) loadSetup(null);
        else web.loadUrl(server + "/");
    }

    private void loadSetup(String error) {
        String url = SETUP_URL + "?url=" + Uri.encode(getServer() == null ? "" : getServer());
        if (error != null) url += "&error=" + Uri.encode(error);
        web.loadUrl(url);
    }

    private boolean isTrustedHost(String host) {
        return host != null && (host.equalsIgnoreCase(ASSET_HOST) || host.equalsIgnoreCase(serverHost()));
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("No hay una aplicación para abrir este enlace");
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    // ------------------------------------------------------------------ Puente JavaScript

    private class Bridge {
        @JavascriptInterface
        public String getServer() {
            String s = MainActivity.this.getServer();
            return s == null ? "" : s;
        }

        @JavascriptInterface
        public String getVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public boolean setServer(String url) {
            String normalized = normalize(url);
            if (normalized == null) return false;
            prefs().edit().putString(KEY_SERVER, normalized).apply();
            runOnUiThread(() -> {
                web.loadUrl(normalized + "/");
                web.clearHistory();
            });
            return true;
        }

        @JavascriptInterface
        public void changeServer() {
            runOnUiThread(() -> loadSetup(null));
        }

        @JavascriptInterface
        public void saveFile(String name, String mime, String base64) {
            final byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                runOnUiThread(() -> toast("No se pudo guardar el archivo"));
                return;
            }
            final String safeName = name == null || name.trim().isEmpty() ? "castrox-archivo" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
            final String safeMime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            runOnUiThread(() -> withStorage(() -> writeDownload(safeName, safeMime, data)));
        }

        @JavascriptInterface
        public void printHtml(String html, String title) {
            runOnUiThread(() -> print(html, title == null || title.isEmpty() ? "CastroX" : title));
        }
    }

    // ------------------------------------------------------------------ Archivos

    private void withStorage(Runnable action) {
        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingStorageAction = action;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        } else {
            action.run();
        }
    }

    private void writeDownload(String name, String mime, byte[] data) {
        try {
            Uri openUri = null;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("MediaStore");
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    if (os == null) throw new IllegalStateException("stream");
                    os.write(data);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, values, null, null);
                openUri = uri;
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("dir");
                File file = new File(dir, name);
                int i = 1;
                while (file.exists()) {
                    int dot = name.lastIndexOf('.');
                    String base = dot > 0 ? name.substring(0, dot) : name;
                    String ext = dot > 0 ? name.substring(dot) : "";
                    file = new File(dir, base + " (" + i++ + ")" + ext);
                }
                try (FileOutputStream fos = new FileOutputStream(file)) {
                    fos.write(data);
                }
                MediaScannerConnection.scanFile(this, new String[]{file.getAbsolutePath()}, new String[]{mime}, null);
            }
            offerOpen(name, openUri, mime);
        } catch (Exception e) {
            toast("No se pudo guardar el archivo: " + e.getMessage());
        }
    }

    private void offerOpen(String name, Uri uri, String mime) {
        if (uri == null) {
            toast("Guardado en Descargas: " + name);
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Archivo guardado")
                .setMessage("\"" + name + "\" se guardó en la carpeta Descargas.")
                .setPositiveButton("Abrir", (d, w) -> {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, mime);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(intent);
                    } catch (ActivityNotFoundException e) {
                        toast("No hay una aplicación instalada para abrir este archivo");
                    }
                })
                .setNegativeButton("Cerrar", null)
                .show();
    }

    // ------------------------------------------------------------------ Impresión

    private void print(String html, String title) {
        WebView view = new WebView(this);
        view.getSettings().setJavaScriptEnabled(false);
        view.setWebViewClient(new WebViewClient() {
            private boolean sent = false;

            @Override
            public void onPageFinished(WebView v, String url) {
                if (sent) return;
                sent = true;
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(title);
                pm.print(title, adapter, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            }
        });
        String base = getServer() == null ? "" : getServer() + "/";
        view.loadDataWithBaseURL(base, html, "text/html", "UTF-8", null);
        printView = view; // mantener la referencia mientras se imprime
    }

    // ------------------------------------------------------------------ Navegación

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if ((scheme.equals("http") || scheme.equals("https")) && isTrustedHost(uri.getHost())) return false;
            openExternal(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            if (ASSET_HOST.equalsIgnoreCase(request.getUrl().getHost())) return;
            loadSetup("No se pudo conectar con el servidor (" + error.getDescription() + "). Revisa tu conexión a internet o la dirección del servidor.");
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (!request.isForMainFrame()) return;
            int code = response.getStatusCode();
            if (code >= 500 || code == 404) {
                loadSetup("El servidor respondió con un error (" + code + "). Es posible que la dirección haya cambiado o que el servidor esté apagado.");
            }
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                boolean wantsCamera = Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                if (!wantsCamera || !isTrustedHost(request.getOrigin().getHost())) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    if (pendingCameraRequest != null) pendingCameraRequest.deny();
                    pendingCameraRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_CAMERA && pendingCameraRequest != null) {
            if (granted) {
                pendingCameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingCameraRequest.deny();
                if (!shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) showSettingsDialog("la cámara");
            }
            pendingCameraRequest = null;
        } else if (requestCode == REQ_STORAGE) {
            if (granted && pendingStorageAction != null) pendingStorageAction.run();
            else if (!granted) toast("Se necesita permiso de almacenamiento para guardar archivos");
            pendingStorageAction = null;
        }
    }

    private void showSettingsDialog(String what) {
        new AlertDialog.Builder(this)
                .setTitle("Permiso necesario")
                .setMessage("Para escanear códigos, CastroX necesita acceso a " + what + ". Actívalo en los ajustes de la aplicación.")
                .setPositiveButton("Abrir ajustes", (d, w) -> {
                    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                })
                .setNegativeButton("Ahora no", null)
                .show();
    }

    // ------------------------------------------------------------------ Ciclo de vida

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.__castroxBack && window.__castroxBack()) ? '1' : '0'", value -> {
            if ("\"1\"".equals(value)) return;
            moveTaskToBack(true);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (printView != null) printView.destroy();
        web.destroy();
        super.onDestroy();
    }
}
