@file:OptIn(ExperimentalMaterial3Api::class)

package com.autobridge.app.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.autobridge.app.R
import com.autobridge.app.core.ui.compactCount
import com.autobridge.app.core.ui.rating
import com.autobridge.app.core.ui.theme.RatingGreen

@Composable
fun AppTopBar(title: String, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title, maxLines = 1) },
        navigationIcon = {
            if (onBack != null) IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
            }
        },
        actions = actions,
    )
}

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f).semantics { heading() })
        if (actionLabel != null && onAction != null) TextButton(onClick = onAction) { Text(actionLabel) }
    }
}

/** AutoBridge customer rating. */
@Composable
fun RatingBadge(value: Double, count: Int, modifier: Modifier = Modifier) {
    val desc = stringResource(R.string.rating_cd, rating(value), count)
    if (count == 0) {
        Text(stringResource(R.string.rating_new), style = MaterialTheme.typography.labelMedium, modifier = modifier)
        return
    }
    Row(modifier.semantics(mergeDescendants = true) { contentDescription = desc }, verticalAlignment = Alignment.CenterVertically) {
        Surface(color = RatingGreen, shape = RoundedCornerShape(6.dp)) {
            Row(Modifier.padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(rating(value), color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Icon(Icons.Filled.Star, null, tint = Color.White, modifier = Modifier.size(12.dp))
            }
        }
        Spacer(Modifier.width(4.dp))
        Text("(${compactCount(count)})", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Google rating, always explicitly labelled and kept separate from AutoBridge ratings. */
@Composable
fun GoogleRatingLabel(value: Double?, count: Int?, modifier: Modifier = Modifier) {
    if (value == null) return
    Text(
        stringResource(R.string.google_rating, rating(value), compactCount(count ?: 0)),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier,
    )
}

@Composable
fun LoadingState(modifier: Modifier = Modifier) {
    val label = stringResource(R.string.loading)
    Box(modifier.fillMaxSize().semantics { contentDescription = label }, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, message: String, modifier: Modifier = Modifier, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Column(
        modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, null, modifier = Modifier.size(56.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(4.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onAction) { Text(actionLabel) }
        }
    }
}

@Composable
fun ErrorState(message: String?, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    EmptyState(
        icon = Icons.Filled.ErrorOutline,
        title = stringResource(R.string.error_generic),
        message = message.orEmpty(),
        modifier = modifier,
        actionLabel = stringResource(R.string.retry),
        onAction = onRetry,
    )
}

@Composable
fun OfflineBanner(visible: Boolean) {
    if (!visible) return
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CloudOff, null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.offline_banner), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onErrorContainer)
        }
    }
}

@Composable
fun DemoBanner(visible: Boolean) {
    if (!visible) return
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.demo_mode_banner),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
    }
}

/** Placeholder artwork for partners without photos (demo data never uses real shop photos). */
@Composable
fun PhotoPlaceholder(icon: ImageVector, modifier: Modifier = Modifier, seed: Int = 0) {
    val palettes = listOf(
        listOf(Color(0xFFFFB38A), Color(0xFFF2611D)), listOf(Color(0xFF9EC5FF), Color(0xFF3D5A80)),
        listOf(Color(0xFF8EE3C8), Color(0xFF00796B)), listOf(Color(0xFFD7B5FF), Color(0xFF6A3FA0)),
    )
    val colors = palettes[(seed and 0x7fffffff) % palettes.size]
    Box(modifier.background(Brush.linearGradient(colors)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(40.dp))
    }
}

@Composable
fun InfoPill(text: String, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, container: Color = MaterialTheme.colorScheme.surfaceVariant, content: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Surface(color = container, shape = RoundedCornerShape(50), modifier = modifier) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = content, maxLines = maxLines, softWrap = maxLines != 1, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
    }
}

@Composable
fun ConfirmDialog(title: String, message: String, confirmLabel: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirmLabel) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}

@Composable
fun StarRatingInput(value: Int, onChange: (Int) -> Unit, label: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Row {
            (1..5).forEach { i ->
                val cd = stringResource(R.string.stars_cd, i)
                IconButton(onClick = { onChange(i) }, modifier = Modifier.semantics { contentDescription = cd }) {
                    Icon(
                        Icons.Filled.Star, null,
                        tint = if (i <= value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                    )
                }
            }
        }
    }
}
