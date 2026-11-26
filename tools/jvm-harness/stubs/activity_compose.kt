package androidx.activity.compose
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.runtime.Composable
@Composable fun BackHandler(enabled: Boolean = true, onBack: () -> Unit) {}
class ManagedActivityResultLauncher<I, O> : ActivityResultLauncher<I>() { override fun launch(input: I) {} }
@Composable fun <I, O> rememberLauncherForActivityResult(contract: ActivityResultContract<I, O>, onResult: (O) -> Unit): ManagedActivityResultLauncher<I, O> = TODO()
