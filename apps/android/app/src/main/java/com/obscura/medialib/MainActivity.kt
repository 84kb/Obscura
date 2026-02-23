package com.obscura.medialib

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.obscura.medialib.ui.HomeScreen

// If we need Capacitor plugins to be registered, we might need a Hybrid approach later.
// For now, as per Native Replacement, we inherit from ComponentActivity to use pure Jetpack Compose.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HomeScreen()
        }
    }
}
