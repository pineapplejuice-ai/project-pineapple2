package com.autobridge.app.feature.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.autobridge.app.R
import com.autobridge.app.core.di.AppConfig
import com.autobridge.app.core.ui.components.AppTopBar
import com.autobridge.app.core.ui.components.SectionHeader
import com.autobridge.app.core.ui.roleLabel
import com.autobridge.core.domain.repository.AuthRepository
import com.autobridge.core.domain.repository.SettingsRepository
import com.autobridge.core.model.UserProfile
import com.autobridge.core.model.UserRole
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val user: UserProfile? = null,
    val versionName: String = "",
    val isDemo: Boolean = true,
    val placesEnabled: Boolean = false,
    val roleSwitcherUnlocked: Boolean = false,
    val tapsToUnlock: Int = ProfileViewModel.TAPS_TO_UNLOCK,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val settings: SettingsRepository,
    private val config: AppConfig,
) : ViewModel() {
    private val taps = MutableStateFlow(0)

    val state: StateFlow<ProfileUiState> = combine(auth.currentUser, settings.observeRoleSwitcherUnlocked(), taps) { u, unlocked, t ->
        ProfileUiState(u, config.versionName, config.isDemo, config.placesEnabled, unlocked && config.isDemo, (TAPS_TO_UNLOCK - t).coerceAtLeast(0))
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProfileUiState(versionName = config.versionName, isDemo = config.isDemo))

    /** Demo only: tapping the app version 7 times unlocks the role switcher (real roles come from custom claims). */
    fun onVersionTapped() {
        if (!config.isDemo) return
        val n = taps.updateAndGet { it + 1 }
        if (n >= TAPS_TO_UNLOCK) viewModelScope.launch { settings.setRoleSwitcherUnlocked(true) }
    }

    fun switchRole(role: UserRole) = viewModelScope.launch { auth.setDemoRole(role) }
    fun signOut() = viewModelScope.launch { auth.signOut() }

    companion object { const val TAPS_TO_UNLOCK = 7 }
}

@Composable
fun ProfileScreen(
    onBack: (() -> Unit)?,
    onOpenVehicles: () -> Unit,
    onOpenAddresses: () -> Unit,
    onOpenFavourites: () -> Unit,
    vm: ProfileViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    Scaffold(topBar = { AppTopBar(stringResource(R.string.tab_profile), onBack) }) { p ->
        Column(Modifier.padding(p).verticalScroll(rememberScrollState())) {
            ListItem(
                headlineContent = { Text(s.user?.name.orEmpty(), fontWeight = FontWeight.Bold) },
                supportingContent = { Text(s.user?.phone.orEmpty()) },
                leadingContent = { Icon(Icons.Filled.AccountCircle, null, Modifier.size(40.dp)) },
                trailingContent = { s.user?.let { Text(stringResource(roleLabel(it.role))) } },
            )
            HorizontalDivider()
            if (s.user?.role == UserRole.CUSTOMER) {
                ProfileRow(Icons.Filled.DirectionsCar, stringResource(R.string.vehicles_title), onOpenVehicles)
                ProfileRow(Icons.Filled.Place, stringResource(R.string.addresses_title), onOpenAddresses)
                ProfileRow(Icons.Filled.Favorite, stringResource(R.string.favourites_title), onOpenFavourites)
                HorizontalDivider()
            }
            if (s.roleSwitcherUnlocked) {
                SectionHeader(stringResource(R.string.profile_role_switcher))
                Text(stringResource(R.string.profile_role_switcher_body), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp))
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    UserRole.entries.forEach { r ->
                        FilterChip(selected = s.user?.role == r, onClick = { vm.switchRole(r) }, label = { Text(stringResource(roleLabel(r))) }, modifier = Modifier.testTag("role_${r.name}"))
                    }
                }
                HorizontalDivider()
            }
            ProfileRow(Icons.AutoMirrored.Filled.Logout, stringResource(R.string.profile_sign_out), { vm.signOut() })
            HorizontalDivider()
            ListItem(
                headlineContent = { Text(stringResource(R.string.profile_version, s.versionName)) },
                supportingContent = {
                    Column {
                        Text(stringResource(if (s.isDemo) R.string.profile_mode_demo else R.string.profile_mode_firebase))
                        Text(stringResource(if (s.placesEnabled) R.string.profile_places_on else R.string.profile_places_off))
                        if (s.isDemo && !s.roleSwitcherUnlocked && s.tapsToUnlock in 1..4) Text(stringResource(R.string.profile_taps_left, s.tapsToUnlock))
                    }
                },
                modifier = Modifier.clickable(role = Role.Button, onClick = vm::onVersionTapped).testTag("app_version"),
            )
        }
    }
}

@Composable
private fun ProfileRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, onClick: () -> Unit) {
    ListItem(headlineContent = { Text(title) }, leadingContent = { Icon(icon, null) }, modifier = Modifier.clickable(role = Role.Button, onClick = onClick))
}
