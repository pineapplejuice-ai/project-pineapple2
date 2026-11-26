package com.autobridge.app.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val BrandOrange = Color(0xFFF2611D)
val BrandOrangeDark = Color(0xFFFF8A50)
val SuccessGreen = Color(0xFF1E8E3E)
val RatingGreen = Color(0xFF1B873F)
val WarningAmber = Color(0xFFB26A00)

private val Light = lightColorScheme(
    primary = BrandOrange,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFDBCC),
    onPrimaryContainer = Color(0xFF3A0B00),
    secondary = Color(0xFF3D5A80),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFD6E3FF),
    onSecondaryContainer = Color(0xFF001B3D),
    tertiary = Color(0xFF00696E),
    background = Color(0xFFFFFBF8),
    surface = Color(0xFFFFFBF8),
    surfaceVariant = Color(0xFFF5EDE8),
    error = Color(0xFFBA1A1A),
)

private val Dark = darkColorScheme(
    primary = BrandOrangeDark,
    onPrimary = Color(0xFF5A1A00),
    primaryContainer = Color(0xFF7F2B00),
    onPrimaryContainer = Color(0xFFFFDBCC),
    secondary = Color(0xFFA9C7FF),
    secondaryContainer = Color(0xFF26446A),
    onSecondaryContainer = Color(0xFFD6E3FF),
    tertiary = Color(0xFF4DD9E0),
    background = Color(0xFF1A1210),
    surface = Color(0xFF1A1210),
    surfaceVariant = Color(0xFF3A2E29),
)

@Composable
fun AutoBridgeTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) Dark else Light, typography = Typography(), content = content)
}
