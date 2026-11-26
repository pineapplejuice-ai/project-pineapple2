package androidx.lifecycle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
// Functional stand-ins for androidx.lifecycle so ViewModel unit tests can run in this harness.
abstract class ViewModel {
    internal val scope: CoroutineScope by lazy { CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate) }
    protected open fun onCleared() {}
}
val ViewModel.viewModelScope: CoroutineScope get() = scope
class SavedStateHandle(initial: Map<String, Any?> = emptyMap()) {
    private val map = initial.toMutableMap()
    @Suppress("UNCHECKED_CAST") operator fun <T> get(key: String): T? = map[key] as T?
    operator fun <T> set(key: String, value: T?) { map[key] = value }
    @Suppress("UNCHECKED_CAST") fun <T> remove(key: String): T? = map.remove(key) as T?
    fun <T> getStateFlow(key: String, initialValue: T): StateFlow<T> = MutableStateFlow(initialValue)
}
