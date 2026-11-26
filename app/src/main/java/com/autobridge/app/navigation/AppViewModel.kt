package com.autobridge.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autobridge.app.core.di.AppConfig
import com.autobridge.app.core.platform.ConnectivityObserver
import com.autobridge.core.domain.repository.AuthRepository
import com.autobridge.core.model.UserProfile
import com.autobridge.core.model.UserRole
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Which navigation graph is active. Changing area rebuilds the NavHost with the right start screen. */
enum class AppArea { LOGIN, CUSTOMER, PARTNER, RIDER, OPS }

data class AppUiState(val user: UserProfile? = null, val isOnline: Boolean = true, val isDemo: Boolean = true) {
    val area: AppArea get() = when {
        user == null || user.name.isBlank() -> AppArea.LOGIN
        user.role == UserRole.PARTNER -> AppArea.PARTNER
        user.role == UserRole.RIDER -> AppArea.RIDER
        user.role == UserRole.OPS -> AppArea.OPS
        else -> AppArea.CUSTOMER
    }
}

@HiltViewModel
class AppViewModel @Inject constructor(auth: AuthRepository, connectivity: ConnectivityObserver, config: AppConfig) : ViewModel() {
    val state: StateFlow<AppUiState> = combine(auth.currentUser, connectivity.isOnline) { user, online ->
        AppUiState(user, online, config.isDemo)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppUiState(auth.currentUser.value, true, config.isDemo))
}
