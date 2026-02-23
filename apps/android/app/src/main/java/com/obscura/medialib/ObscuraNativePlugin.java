package com.obscura.medialib;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ObscuraNative")
public class ObscuraNativePlugin extends Plugin {

    @PluginMethod
    public void selectFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderSelectionResult");
    }

    @ActivityCallback
    private void folderSelectionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            if (uri != null) {
                // Persist permissions
                try {
                     getContext().getContentResolver().takePersistableUriPermission(uri,
                             Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception e) {
                    // Ignore if already persisted or failed
                }

                JSObject ret = new JSObject();
                ret.put("uri", uri.toString());
                call.resolve(ret);
            } else {
                call.reject("No URI returned");
            }
        } else {
            call.reject("Folder selection cancelled");
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("URI required");
            return;
        }

        Uri uri = Uri.parse(uriString);
        androidx.documentfile.provider.DocumentFile dir = androidx.documentfile.provider.DocumentFile.fromTreeUri(getContext(), uri);

        if (dir == null || !dir.isDirectory()) {
            call.reject("Invalid directory URI");
            return;
        }

        JSObject result = new JSObject();
        com.getcapacitor.JSArray filesArray = new com.getcapacitor.JSArray();


        for (androidx.documentfile.provider.DocumentFile file : dir.listFiles()) {
            JSObject fileObj = new JSObject();
            fileObj.put("name", file.getName());
            fileObj.put("uri", file.getUri().toString());
            fileObj.put("isDirectory", file.isDirectory());
            fileObj.put("mimeType", file.getType());
            fileObj.put("size", file.length());
            fileObj.put("lastModified", file.lastModified());
            filesArray.put(fileObj);
        }

        result.put("files", filesArray);
        call.resolve(result);
    }

    @PluginMethod
    public void getMediaMetadata(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("URI required");
            return;
        }

        android.media.MediaMetadataRetriever retriever = new android.media.MediaMetadataRetriever();
        try {
            Uri uri = Uri.parse(uriString);
            retriever.setDataSource(getContext(), uri);

            String durationStr = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
            String widthStr = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
            String heightStr = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
            
            // Rotation handling
            String rotationStr = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
            int rotation = rotationStr != null ? Integer.parseInt(rotationStr) : 0;
            
            long duration = durationStr != null ? Long.parseLong(durationStr) : 0;
            int width = widthStr != null ? Integer.parseInt(widthStr) : 0;
            int height = heightStr != null ? Integer.parseInt(heightStr) : 0;

            // Swap dimensions if rotated 90 or 270 degrees
            if (rotation == 90 || rotation == 270) {
                int temp = width;
                width = height;
                height = temp;
            }

            JSObject ret = new JSObject();
            ret.put("duration", duration / 1000.0); // Convert to seconds
            ret.put("width", width);
            ret.put("height", height);
            
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get metadata: " + e.getMessage());
        } finally {
            try {
                retriever.release();
            } catch (Exception ignored) {}
        }
    }

    @PluginMethod
    public void generateThumbnail(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("URI required");
            return;
        }

        android.media.MediaMetadataRetriever retriever = new android.media.MediaMetadataRetriever();
        try {
            Uri uri = Uri.parse(uriString);
            retriever.setDataSource(getContext(), uri);

            // Get frame at 10% or 1 second? Let's try 1 second (1000000 microseconds)
            // or just the first frame if unspecified. 
            // Frame at 1 second implies skipping intros.
            android.graphics.Bitmap bitmap = retriever.getFrameAtTime(1000000, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            
            if (bitmap == null) {
                // Fallback to any frame
                bitmap = retriever.getFrameAtTime();
            }

            if (bitmap != null) {
                // Resize for thumbnail (e.g. max 320px width) to save space/memory
                int w = bitmap.getWidth();
                int h = bitmap.getHeight();
                float aspectRatio = (float) w / h;
                int targetWidth = 320;
                int targetHeight = (int) (targetWidth / aspectRatio);
                
                android.graphics.Bitmap scaledBitmap = android.graphics.Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true);
                
                // Save to cache directory
                java.io.File cacheDir = getContext().getCacheDir();
                java.io.File thumbsDir = new java.io.File(cacheDir, "thumbnails");
                if (!thumbsDir.exists()) {
                    thumbsDir.mkdirs();
                }

                // Generate filename based on URI hash to cache effectively
                String filename = "thumb_" + uriString.hashCode() + ".jpg";
                java.io.File file = new java.io.File(thumbsDir, filename);

                try (java.io.FileOutputStream out = new java.io.FileOutputStream(file)) {
                    scaledBitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, out);
                }
                
                // Recycle bitmaps
                if (bitmap != scaledBitmap) {
                    bitmap.recycle();
                }
                // We keep scaledBitmap? No, we saved it.
                // scaledBitmap.recycle(); // Capacitor plugin returning might not need it, but good practice if not used.

                JSObject ret = new JSObject();
                // Return file:// URI
                ret.put("path", "file://" + file.getAbsolutePath()); 
                call.resolve(ret);
            } else {
                call.reject("Failed to generate thumbnail bitmap");
            }

        } catch (Exception e) {
             call.reject("Thumbnail generation failed: " + e.getMessage());
        } finally {
             try {
                retriever.release();
            } catch (Exception ignored) {}
        }
    }
}
